import {
  createFieldIssue,
  createStreamPost,
  createCalendarEvent,
  createTask,
  completeTask,
  updateTask,
  notifyCalendarInvitees,
} from '@siteweave/core-logic';
import { uploadIssuePhotoFromUri } from './uploadIssuePhoto';
import { removeOfflinePhoto } from './offlinePhotoStorage';

export function buildOfflineHandlers(supabase) {
  if (!supabase) return {};

  return {
    create_issue: async (payload) => {
      const { localPhotoUri, ...issueData } = payload;
      const issue = await createFieldIssue(supabase, issueData);
      if (localPhotoUri && issue?.id) {
        try {
          await uploadIssuePhotoFromUri(supabase, {
            issueId: issue.id,
            uri: localPhotoUri,
            userId: issueData.created_by_user_id,
            organizationId: issueData.organization_id,
          });
          await removeOfflinePhoto(localPhotoUri);
        } catch (error) {
          console.error('Offline issue photo upload failed:', error);
          throw error;
        }
      }
    },
    create_stream_post: async (payload) => {
      await createStreamPost(supabase, payload);
    },
    complete_task: async (payload) => {
      await completeTask(supabase, payload.taskId);
    },
    update_task: async (payload) => {
      await updateTask(supabase, payload.taskId, payload.updates);
    },
    update_issue_status: async (payload) => {
      const { error } = await supabase
        .from('project_issues')
        .update({ status: payload.nextStatus, updated_at: new Date().toISOString() })
        .eq('id', payload.issueId)
        .eq('organization_id', payload.organizationId);
      if (error) throw error;
    },
    create_calendar_event: async (payload) => {
      const { _notifyEmails, _organizerName, ...eventData } = payload;
      const created = await createCalendarEvent(supabase, eventData);
      if (_notifyEmails?.length && created?.id) {
        try {
          await notifyCalendarInvitees(supabase, {
            eventId: created.id,
            newAttendeeEmails: _notifyEmails,
            organizerName: _organizerName,
          });
        } catch (error) {
          console.error('Offline calendar invite notify failed:', error);
        }
      }
    },
    update_calendar_event: async (payload) => {
      const { id, _notifyEmails, _organizerName, ...updates } = payload;
      const { error } = await supabase.from('calendar_events').update(updates).eq('id', id);
      if (error) throw error;
      if (_notifyEmails?.length && id) {
        try {
          await notifyCalendarInvitees(supabase, {
            eventId: id,
            newAttendeeEmails: _notifyEmails,
            organizerName: _organizerName,
          });
        } catch (error) {
          console.error('Offline calendar invite notify failed:', error);
        }
      }
    },
    delete_calendar_event: async (payload) => {
      const { error } = await supabase.from('calendar_events').delete().eq('id', payload.id);
      if (error) throw error;
    },
    create_task_from_event: async (payload) => {
      await createTask(supabase, payload);
    },
    create_task: async (payload) => {
      await createTask(supabase, payload);
    },
  };
}
