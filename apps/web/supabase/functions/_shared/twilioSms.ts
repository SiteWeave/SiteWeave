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

export async function sendTwilioSms({ to, body }: SendSmsParams): Promise<SendSmsResult> {
  const accountSid = requiredEnv('TWILIO_ACCOUNT_SID')
  const apiKey = requiredEnv('TWILIO_API_KEY')
  const apiSecret = requiredEnv('TWILIO_API_SECRET')
  const messagingServiceSid = requiredEnv('TWILIO_MESSAGING_SERVICE_SID')
  const fromNumber = requiredEnv('TWILIO_FROM_NUMBER')

  if (!accountSid || !apiKey || !apiSecret) {
    return { success: false, error: 'twilio_not_configured' }
  }

  if (!messagingServiceSid && !fromNumber) {
    return { success: false, error: 'twilio_sender_not_configured' }
  }

  const params = new URLSearchParams()
  params.set('To', to)
  params.set('Body', body)
  if (messagingServiceSid) {
    params.set('MessagingServiceSid', messagingServiceSid)
  } else if (fromNumber) {
    params.set('From', fromNumber)
  }

  const token = btoa(`${apiKey}:${apiSecret}`)
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = payload?.message || `twilio_http_${response.status}`
      return { success: false, error: message }
    }

    return {
      success: true,
      sid: payload?.sid,
      status: payload?.status,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'twilio_request_failed',
    }
  }
}
