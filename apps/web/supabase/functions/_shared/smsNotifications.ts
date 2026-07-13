/** Server-side kill switch — set Supabase secret SMS_NOTIFICATIONS_ENABLED=true to restore. See docs/SMS-NOTIFICATIONS-RESTORE.md */
export function isSmsNotificationsEnabled(): boolean {
  return Deno.env.get('SMS_NOTIFICATIONS_ENABLED') === 'true'
}
