import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Share, Platform } from 'react-native';

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function saveProgressReportPdf(html, { defaultFilename = 'progress-report' } = {}) {
  if (!html) {
    return { ok: false, error: 'No document to export' };
  }

  const safeName = `${defaultFilename.replace(/[^\w.-]+/g, '-')}.pdf`;

  try {
    const { uri } = await Print.printToFileAsync({ html });
    const target = new File(Paths.cache, safeName);
    if (target.exists) {
      target.delete();
    }
    await new File(uri).copy(target);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(target.uri, {
        mimeType: 'application/pdf',
        dialogTitle: safeName,
        UTI: 'com.adobe.pdf',
      });
      return { ok: true, path: target.uri };
    }

    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      await Share.share({
        url: target.uri,
        title: safeName,
        message: stripHtml(html).slice(0, 2000) || safeName,
      });
      return { ok: true, path: target.uri };
    }

    return { ok: false, error: 'Sharing is not available on this device' };
  } catch (error) {
    if (error?.message?.includes('User did not share') || error?.message?.includes('cancel')) {
      return { ok: true, canceled: true };
    }
    return { ok: false, error: error?.message || 'Could not share report' };
  }
}
