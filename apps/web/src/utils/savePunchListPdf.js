import { saveProgressReportPdf } from './saveProgressReportPdf';

export async function savePunchListPdf(html, options = {}) {
  const filename = options.defaultFilename || 'punch-list.pdf';
  return saveProgressReportPdf(html, { defaultFilename: filename });
}
