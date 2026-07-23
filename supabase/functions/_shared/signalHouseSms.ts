export interface SendSmsParams {
  to: string
  body: string
}

export interface SendSmsResult {
  success: boolean
  sid?: string
  status?: string
  error?: string
}

function requiredEnv(name: string): string | null {
  const value = Deno.env.get(name)
  if (!value || !value.trim()) return null
  return value.trim()
}

/**
 * Signal House expects digit strings without '+'.
 * US numbers must include country code (15125551234). Sending bare 10-digit
 * national form returns "Number not found: NNNNNNNNNN" for the sender.
 */
export function toSignalHousePhone(phone: string): string {
  let digits = String(phone || '').replace(/\D/g, '')
  if (digits.length === 10) {
    digits = `1${digits}`
  }
  return digits
}

function signalHouseBaseUrl(): string {
  return (requiredEnv('SIGNAL_HOUSE_BASE_URL') || 'https://v2.signalhouse.io').replace(/\/+$/, '')
}

/** Pull the useful detail out of Nest-style / Signal House error bodies. */
function extractSignalHouseError(payload: unknown, status: number): string {
  if (!payload || typeof payload !== 'object') {
    return `signal_house_http_${status}`
  }
  const p = payload as Record<string, unknown>
  const parts: string[] = []

  if (typeof p.message === 'string' && p.message.trim()) {
    parts.push(p.message.trim())
  } else if (Array.isArray(p.message)) {
    for (const item of p.message) {
      if (typeof item === 'string' && item.trim()) parts.push(item.trim())
      else if (item && typeof item === 'object') parts.push(JSON.stringify(item))
    }
  }

  if (typeof p.error === 'string' && p.error.trim()) {
    if (!parts.includes(p.error.trim())) parts.push(p.error.trim())
  } else if (p.error && typeof p.error === 'object') {
    parts.push(JSON.stringify(p.error))
  }

  if (Array.isArray(p.errors)) {
    for (const e of p.errors) {
      if (typeof e === 'string' && e.trim()) {
        parts.push(e.trim())
      } else if (e && typeof e === 'object') {
        const row = e as Record<string, unknown>
        const field = row.field || row.path || row.property || row.param
        const msg = row.message || row.msg || row.error
        if (field && msg) parts.push(`${field}: ${msg}`)
        else if (typeof msg === 'string') parts.push(msg)
        else parts.push(JSON.stringify(e))
      }
    }
  } else if (p.errors && typeof p.errors === 'object') {
    for (const [field, msgs] of Object.entries(p.errors as Record<string, unknown>)) {
      if (Array.isArray(msgs)) parts.push(`${field}: ${msgs.map(String).join(', ')}`)
      else if (msgs != null) parts.push(`${field}: ${String(msgs)}`)
    }
  }

  // Capture other common detail keys when message is generic
  for (const key of ['detail', 'details', 'description', 'reason', 'title']) {
    const v = p[key]
    if (typeof v === 'string' && v.trim() && !parts.includes(v.trim())) parts.push(v.trim())
  }

  const unique = [...new Set(parts.filter(Boolean))]
  if (!unique.length) {
    try {
      const raw = JSON.stringify(payload)
      if (raw && raw !== '{}') return `signal_house_http_${status}: ${raw.slice(0, 400)}`
    } catch {
      /* ignore */
    }
    return `signal_house_http_${status}`
  }
  if (unique.length === 1 && /validation failed/i.test(unique[0])) {
    try {
      const raw = JSON.stringify(payload)
      if (raw && raw !== '{}' && raw !== `{"message":"${unique[0]}"}`) {
        return `${unique[0]} — ${raw.slice(0, 300)}`
      }
    } catch {
      /* ignore */
    }
    return `${unique[0]} (HTTP ${status})`
  }
  return unique.join(' — ')
}

/**
 * Send SMS via Signal House REST API.
 * Secrets: SIGNAL_HOUSE_API_KEY, SIGNAL_HOUSE_FROM_NUMBER
 * Optional: SIGNAL_HOUSE_BASE_URL (default https://v2.signalhouse.io)
 *
 * Payload shape matches the official Signal House Python/PHP SDK `sendSMS`.
 */
export async function sendSms({ to, body }: SendSmsParams): Promise<SendSmsResult> {
  const apiKey = requiredEnv('SIGNAL_HOUSE_API_KEY')
  const fromNumber = requiredEnv('SIGNAL_HOUSE_FROM_NUMBER')

  if (!apiKey) {
    return { success: false, error: 'signal_house_not_configured' }
  }
  if (!fromNumber) {
    return { success: false, error: 'signal_house_sender_not_configured' }
  }

  const senderPhoneNumber = toSignalHousePhone(fromNumber)
  const recipientPhoneNumber = toSignalHousePhone(to)

  if (!senderPhoneNumber || !recipientPhoneNumber) {
    return { success: false, error: 'invalid_phone_number' }
  }
  if (senderPhoneNumber.length < 11 || recipientPhoneNumber.length < 11) {
    return {
      success: false,
      error: `invalid_phone_number (from=${senderPhoneNumber.length}d to=${recipientPhoneNumber.length}d)`,
    }
  }

  const endpoint = `${signalHouseBaseUrl()}/message/sms`
  // API schema: messageData.recipientPhoneNumber must be an array (string is rejected).
  const requestBody = {
    senderPhoneNumber,
    recipientPhoneNumber: [recipientPhoneNumber],
    messageBody: body,
    enableShortlink: false,
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    const payload = await response.json().catch(() => ({}))

    const markedFailure =
      !response.ok ||
      (payload && typeof payload === 'object' && (payload as { success?: unknown }).success === false)

    if (markedFailure) {
      const message = extractSignalHouseError(payload, response.status)
      console.error('signalHouseSms send failed:', {
        status: response.status,
        fromDigits: senderPhoneNumber.length,
        toDigits: recipientPhoneNumber.length,
        senderLast4: senderPhoneNumber.slice(-4),
        toLast4: recipientPhoneNumber.slice(-4),
        error: message,
        payload,
      })
      return { success: false, error: message }
    }

    const data = (payload as { data?: Record<string, unknown> })?.data ?? payload
    const row = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
    const sid =
      row?.id ||
      row?.messageId ||
      row?.message_id ||
      (payload as { id?: unknown })?.id ||
      undefined
    const status = row?.status || (payload as { status?: unknown })?.status || undefined

    return {
      success: true,
      sid: sid != null ? String(sid) : undefined,
      status: status != null ? String(status) : undefined,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'signal_house_request_failed',
    }
  }
}

/** @deprecated Use sendSms — kept as alias during Twilio → Signal House migration */
export async function sendTwilioSms(params: SendSmsParams): Promise<SendSmsResult> {
  return sendSms(params)
}
