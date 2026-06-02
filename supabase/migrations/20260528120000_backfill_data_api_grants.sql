-- Backfill Data API grants for tables introduced in prior migrations.
-- Safe on fresh installs (GRANT is idempotent) and required when those migrations
-- were already applied before grant statements were added to them.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_photos TO authenticated;
GRANT ALL ON TABLE public.task_photos TO service_role;

GRANT SELECT ON TABLE public.task_notification_history TO authenticated;
GRANT ALL ON TABLE public.task_notification_history TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.schedule_import_templates TO authenticated;
GRANT ALL ON TABLE public.schedule_import_templates TO service_role;

GRANT SELECT, INSERT, DELETE ON TABLE public.task_dependency_notification_history TO authenticated;
GRANT ALL ON TABLE public.task_dependency_notification_history TO service_role;

GRANT SELECT, UPDATE ON TABLE public.user_notifications TO authenticated;
GRANT ALL ON TABLE public.user_notifications TO service_role;

GRANT SELECT ON TABLE public.notification_action_history TO authenticated;
GRANT ALL ON TABLE public.notification_action_history TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.weather_impacts TO authenticated;
GRANT ALL ON TABLE public.weather_impacts TO service_role;

GRANT ALL ON TABLE public.task_notification_guest_shares TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_access_invites TO authenticated;
GRANT ALL ON TABLE public.project_access_invites TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_stream_posts TO authenticated;
GRANT ALL ON TABLE public.project_stream_posts TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_stream_replies TO authenticated;
GRANT ALL ON TABLE public.project_stream_replies TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_comments TO authenticated;
GRANT ALL ON TABLE public.task_comments TO service_role;

GRANT SELECT ON TABLE public.sms_phone_consent TO authenticated;
GRANT ALL ON TABLE public.sms_phone_consent TO service_role;
