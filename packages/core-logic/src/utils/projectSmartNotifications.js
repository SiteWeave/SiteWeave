/**
 * Resolve effective smart task notification settings for a project (org defaults vs override).
 */

/**
 * @param {unknown} values
 * @param {number[]} [fallback]
 * @returns {number[]}
 */
export function normalizeSmartNotificationLeadDays(values, fallback = [14, 7]) {
  if (!Array.isArray(values)) return fallback;
  const parsed = values
    .map((v) => Number(v))
    // Day-of-start (0) reminders are excluded — use 1–365 day lead windows only.
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 365)
    .map((n) => Math.trunc(n));
  const unique = Array.from(new Set(parsed));
  return unique.length > 0 ? unique.sort((a, b) => b - a) : fallback;
}

/**
 * @param {Object|null|undefined} project
 * @param {Object|null|undefined} organization
 * @returns {{
 *   useOrgDefaults: boolean,
 *   enabled: boolean,
 *   leadDays: number[],
 *   dependencyEnabled: boolean,
 *   batchingEnabled: boolean,
 *   batchWindowMinutes: number,
 * }}
 */
export function resolveProjectSmartNotificationSettings(project, organization) {
  const useOrgDefaults = project?.task_notifications_use_org_defaults === true;

  const enabled = useOrgDefaults
    ? organization?.task_start_notifications_enabled === true
    : project?.task_start_notifications_enabled === true;

  const leadDays = useOrgDefaults
    ? normalizeSmartNotificationLeadDays(organization?.task_start_notification_lead_days)
    : normalizeSmartNotificationLeadDays(project?.task_start_notification_lead_days);

  return {
    useOrgDefaults,
    enabled,
    leadDays,
    dependencyEnabled: project?.dependency_notifications_enabled !== false,
    batchingEnabled: project?.notification_email_batching_enabled !== false,
    batchWindowMinutes: Number.isFinite(Number(project?.notification_batch_window_minutes))
      ? Math.max(1, Math.min(60, Number(project.notification_batch_window_minutes)))
      : 5,
  };
}

/**
 * @param {number[]} leadDays
 * @returns {string}
 */
export function formatLeadDaysList(leadDays) {
  const days = normalizeSmartNotificationLeadDays(leadDays);
  if (days.length === 1) return String(days[0]);
  if (days.length === 2) return `${days[0]} & ${days[1]}`;
  return days.join(', ');
}
