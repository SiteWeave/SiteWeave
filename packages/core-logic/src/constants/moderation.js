export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate', label: 'Inappropriate Content' },
  { value: 'violence', label: 'Violence or Threats' },
  { value: 'hate_speech', label: 'Hate Speech' },
  { value: 'other', label: 'Other' },
];

export const REASON_LABELS = Object.fromEntries(
  REPORT_REASONS.map((r) => [r.value, r.label]),
);

export const REPORT_STATUS_COLORS = {
  pending: '#F59E0B',
  reviewed: '#3B82F6',
  resolved: '#10B981',
  dismissed: '#6B7280',
};

/** Platform developers only (profiles.is_super_admin) — not org admins. */
export function canAccessContentReports(profile) {
  return profile?.is_super_admin === true;
}

/** @deprecated Use canAccessContentReports({ is_super_admin }) instead. */
export function isModerationAdmin(profileRole) {
  return canAccessContentReports(
    typeof profileRole === 'object' ? profileRole : { is_super_admin: false },
  );
}
