/** Shared PM Actions merge helpers for progress-report edge functions. */

const NOTE_FIELDS = [
  'rfi_notes',
  'long_lead_time_notes',
  'change_orders_notes',
  'submittals_notes',
] as const

export type PmActionsNotes = {
  rfi_notes: string
  long_lead_time_notes: string
  change_orders_notes: string
  submittals_notes: string
}

/**
 * Merge multiple PM Actions rows into one notes object (newest non-empty wins per field).
 * Rows should be ordered newest-first by as_of_date.
 */
export function mergePmActionsNotes(rows: any[] | null | undefined): PmActionsNotes | null {
  if (!rows?.length) return null
  const out: PmActionsNotes = {
    rfi_notes: '',
    long_lead_time_notes: '',
    change_orders_notes: '',
    submittals_notes: '',
  }
  for (const field of NOTE_FIELDS) {
    for (const row of rows) {
      const v = String(row?.[field] || '').trim()
      if (v) {
        out[field] = v
        break
      }
    }
  }
  const hasAny = NOTE_FIELDS.some((f) => out[f])
  return hasAny ? out : null
}

export function pmActionsSectionEnabled(reportSections: Record<string, unknown> | null | undefined): boolean {
  return reportSections?.pm_actions !== false
}
