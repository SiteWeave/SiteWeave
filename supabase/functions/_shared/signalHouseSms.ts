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

/** Signal House expects digits (e.g. 15125551234); strip non-digits. */
export function toSignalHousePhone(phone: string): string {
  return String(phone || '').replace(/\D/g, '')
}

function signalHouseBaseUrl(): string {
  return (requiredEnv('SIGNAL_HOUSE_BASE_URL') || 'https://v2.signalhouse.io').replace(/\/+$/, '')
}

/**
 * Send SMS via Signal House REST API.
 * Secrets: SIGNAL_HOUSE_API_KEY, SIGNAL_HOUSE_FROM_NUMBER
 * Optional: SIGNAL_HOUSE_BASE_URL (default https://v2.signalhouse.io)
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

  const endpoint = `${signalHouseBaseUrl()}/message/sms`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        senderPhoneNumber,
        recipientPhoneNumber,
        messageBody: body,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message =
        (typeof payload?.message === 'string' && payload.message) ||
        (typeof payload?.error === 'string' && payload.error) ||
        `signal_house_http_${response.status}`
      return { success: false, error: message }
    }

    const data = payload?.data ?? payload
    const sid =
      data?.id ||
      data?.messageId ||
      data?.message_id ||
      payload?.id ||
      undefined
    const status = data?.status || payload?.status || undefined

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
