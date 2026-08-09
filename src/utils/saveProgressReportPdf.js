/**
 * Save progress report HTML as a real .pdf file.
 *
 * - **Electron**: uses a hidden BrowserWindow + printToPDF + Save dialog (no window.open — avoids
 *   `about:` / shell.openExternal issues when popups are denied).
 * - **Browser / fallback**: html2canvas + jsPDF (downloads a PDF; may be large for very long reports).
 */

/**
 * @param {string} html - Full HTML document from export edge function
 * @param {object} [options]
 * @param {string} [options.defaultFilename] - e.g. "Q1 Report.pdf"
 * @param {string} [options.pdfBase64] - Prefer branded server PDF when present
 * @returns {Promise<{ ok: true, path?: string, canceled?: boolean, method?: 'electron'|'jspdf'|'bytes' } | { ok: false, error: string }>}
 */
export async function saveProgressReportPdf(html, options = {}) {
  let defaultFilename = options.defaultFilename || 'progress-report.pdf';
  defaultFilename = defaultFilename.replace(/[\\/]/g, '_');
  if (!defaultFilename.toLowerCase().endsWith('.pdf')) {
    defaultFilename = defaultFilename.replace(/\.html$/i, '') + '.pdf';
  }

  if (options.pdfBase64 && typeof options.pdfBase64 === 'string') {
    try {
      const binary = atob(options.pdfBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultFilename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return { ok: true, method: 'bytes' };
    } catch (e) {
      console.warn('Branded PDF download failed; falling back to HTML→PDF', e);
    }
  }

  if (!html || typeof html !== 'string') {
    return { ok: false, error: 'No report content to save.' };
  }

  if (typeof window !== 'undefined' && window.electronAPI?.saveHtmlAsPdf) {
    const res = await window.electronAPI.saveHtmlAsPdf({
      html,
      defaultFilename,
    });
    if (res?.canceled) return { ok: true, canceled: true, method: 'electron' };
    if (res?.unsupported) {
      /* preload fallback — use jsPDF path */
    } else if (res?.success) {
      return { ok: true, path: res.path, method: 'electron' };
    } else if (res?.error) {
      return { ok: false, error: res.error };
    }
  }

  try {
    await savePdfWithJsPdf(html, defaultFilename);
    return { ok: true, method: 'jspdf' };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function savePdfWithJsPdf(html, filename) {
  const [jspdfMod, html2canvasMod] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const JsPDF = jspdfMod.default;
  const html2canvas = html2canvasMod.default;

  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, 'text/html');

  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:fixed;left:-9999px;top:0;width:794px;max-width:794px;background:#ffffff;box-sizing:border-box;padding:16px;';
  wrap.append(...Array.from(parsed.body.childNodes));
  document.body.appendChild(wrap);

  // Wait for images (inlined data URIs are usually already complete; remotes may need time).
  await Promise.all(
    Array.from(wrap.querySelectorAll('img')).map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              const done = () => resolve();
              img.addEventListener('load', done, { once: true });
              img.addEventListener('error', done, { once: true });
              setTimeout(done, 10000);
            }),
    ),
  );
  await new Promise((r) => setTimeout(r, 100));

  const canvas = await html2canvas(wrap, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    windowWidth: 794,
  });

  document.body.removeChild(wrap);

  const pdf = new JsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  // Slice the tall canvas across pages; ignore sub-mm float remainder so we do not append a blank last page.
  const EPS_MM = 0.01;
  let offsetY = 0;
  while (offsetY < imgHeight - EPS_MM) {
    if (offsetY > 0) pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, -offsetY, imgWidth, imgHeight);
    offsetY += pageHeight;
  }

  pdf.save(filename);
}
