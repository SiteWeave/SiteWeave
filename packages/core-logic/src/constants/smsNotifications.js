/** Temporary kill switch — set true and redeploy to restore SiteWeave SMS. See docs/SMS-NOTIFICATIONS-RESTORE.md */
export const SMS_NOTIFICATIONS_ENABLED = false;

export function isSmsNotificationsEnabled() {
  return SMS_NOTIFICATIONS_ENABLED === true;
}
