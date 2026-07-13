/** @returns {Array<{ email: string, recipient_type: string }>} */
export function parseProgressReportEmailsText(text) {
  const raw = String(text || '')
    .split(/[\n,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const seen = new Set();
  return raw
    .filter((email) => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    })
    .map((email) => ({ email, recipient_type: 'to' }));
}

export function recipientsToEmailText(recipients = []) {
  return recipients
    .map((r) => r.email)
    .filter(Boolean)
    .join(', ');
}
