export type GenerateProgressReportResult = {
  report_data: Record<string, unknown>
  filtered_data: Record<string, unknown>
  [key: string]: unknown
}

export class GenerateProgressReportError extends Error {
  status: number
  details: Record<string, unknown> | null

  constructor(message: string, status = 502, details: Record<string, unknown> | null = null) {
    super(message)
    this.name = 'GenerateProgressReportError'
    this.status = status
    this.details = details
  }
}

export async function callGenerateProgressReport(params: {
  supabaseUrl: string
  supabaseServiceKey: string
  scheduleId: string
}): Promise<GenerateProgressReportResult> {
  const baseUrl = params.supabaseUrl.replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/functions/v1/generate-progress-report`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.supabaseServiceKey}`,
      apikey: params.supabaseServiceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ schedule_id: params.scheduleId }),
  })

  let payload: Record<string, unknown> | null = null
  try {
    payload = await response.json() as Record<string, unknown>
  } catch {
    throw new GenerateProgressReportError('Generate report returned invalid JSON', 502, null)
  }

  if (!response.ok) {
    const message =
      typeof payload?.error === 'string'
        ? payload.error
        : `Generate report failed (${response.status})`
    const status = response.status >= 400 && response.status < 600 ? response.status : 502
    throw new GenerateProgressReportError(message, status, payload)
  }

  const reportData = payload?.report_data
  const filteredData = payload?.filtered_data
  if (!reportData || !filteredData) {
    throw new GenerateProgressReportError(
      'Report generation returned invalid data (missing report_data or filtered_data)',
      502,
      payload,
    )
  }

  return payload as GenerateProgressReportResult
}
