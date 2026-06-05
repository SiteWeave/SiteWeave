/**
 * PDF filename for progress reports — must match client export
 * (`ProgressReportModal` + `export-progress-report-pdf`).
 * Prefer schedule `name` (report name); fall back to email subject.
 */
export function defaultProgressReportPdfFilename(reportName: string, subject = ''): string {
  const primary = String(reportName ?? '').trim()
  const fallback = String(subject ?? '').trim()
  const raw = primary || fallback || 'progress-report'
  const base =
    raw
      .replace(/[^\w\s-]/g, '')
      .trim()
      .slice(0, 80) || 'progress-report'
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
}
