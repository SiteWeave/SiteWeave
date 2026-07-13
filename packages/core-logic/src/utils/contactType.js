/**
 * Whether a contact row belongs on the Trade Partners (subcontractor) directory.
 * Handles legacy rows that predate strict type values.
 * @param {{ type?: string | null, trade?: string | null, company?: string | null } | null | undefined} contact
 */
export function isTradePartnerContact(contact) {
  if (!contact) return false;
  const type = String(contact.type || '').trim().toLowerCase();
  if (type === 'subcontractor') return true;
  if (type === 'team' || type === 'client') return false;
  if (!type && (contact.trade || contact.company)) return true;
  return false;
}
