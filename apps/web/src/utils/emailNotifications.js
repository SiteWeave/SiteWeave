import { supabaseClient } from '../context/AppContext';
import i18n from '../i18n/config';
import {
    escapeTransactionalHtml as escapeHtml,
    buildComplianceFooterText,
    buildTransactionalShell,
    buildTaskAssignmentEmail,
} from '@siteweave/core-logic';

/**
 * Send task assignment email to external contact
 */
export async function sendTaskAssignmentEmail(contactEmail, taskDetails, projectDetails, assignerName) {
    try {
        if (!contactEmail || !contactEmail.includes('@')) {
            return { success: false, error: 'Invalid email address' };
        }

        const template = buildTaskAssignmentEmail({
            assignerName,
            projectName: projectDetails.name,
            taskTitle: taskDetails.description || taskDetails.title || 'Task',
            projectAddress: projectDetails.address,
            issueTitle: taskDetails.issueTitle,
            dueDate: taskDetails.dueDate ?? taskDetails.due_date ?? null,
            taskLabel: taskDetails.issueTitle ? 'Step' : 'Task',
        });

        const { error } = await supabaseClient.functions.invoke('send-email', {
            body: {
                to: contactEmail,
                subject: template.subject,
                html: template.html,
                text: template.text,
            },
        });

        if (error) {
            console.error('Email sending error:', error);
            return { success: false, error: error.message || 'Failed to send email' };
        }
        return { success: true };
    } catch (error) {
        console.error('Error in sendTaskAssignmentEmail:', error);
        return { success: false, error: error.message || 'Unknown error' };
    }
}

/**
 * Send task update notification to external contact
 */
export async function sendTaskUpdateEmail(contactEmail, updateDetails, projectDetails, updaterName) {
    try {
        if (!contactEmail || !contactEmail.includes('@')) {
            return { success: false, error: 'Invalid email address' };
        }

        const subject = `Task update: ${updateDetails.issueTitle || 'Your task'}`;
        const bodyHtml = `
            <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#374151;">
              <strong style="color:#111827;">${escapeHtml(updaterName)}</strong> posted an update on your task:
            </p>
            <blockquote style="margin:0 0 16px;padding:14px 16px;border-left:3px solid #111827;background:#f9fafb;color:#374151;font-size:15px;line-height:1.55;">
              ${escapeHtml(updateDetails.message)}
            </blockquote>
            <p style="margin:0;font-size:15px;color:#4b5563;">Project: <strong style="color:#111827;">${escapeHtml(projectDetails.name)}</strong></p>
            <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Reply to this email to respond.</p>`;

        const htmlBody = buildTransactionalShell({
            title: subject,
            headline: 'Task update',
            bodyHtml,
            preheader: `${updaterName} posted an update on ${projectDetails.name}.`,
        });

        const textBody = [
            `${updaterName} posted an update on your task:`,
            '',
            updateDetails.message,
            '',
            `Project: ${projectDetails.name}`,
            '',
            buildComplianceFooterText(),
        ].join('\n');

        const { error } = await supabaseClient.functions.invoke('send-email', {
            body: { to: contactEmail, subject, html: htmlBody, text: textBody },
        });

        if (error) {
            return { success: false, error: error.message };
        }
        return { success: true };
    } catch (error) {
        console.error('Error in sendTaskUpdateEmail:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Short reminder (“ping”) for an assignee who already has the task.
 */
export async function sendTaskPingEmail(contactEmail, taskDetails, projectDetails, senderName) {
    try {
        if (!contactEmail || !contactEmail.includes('@')) {
            return { success: false, error: 'Invalid email address' };
        }

        const taskTitle = taskDetails.title || 'Task';
        const subject = `Reminder: ${taskTitle} — ${projectDetails.name}`;

        const locationBlock = projectDetails.address
            ? `<p style="margin:12px 0 0;font-size:14px;color:#4b5563;">Location: ${escapeHtml(projectDetails.address)}</p>`
            : '';

        const bodyHtml = `
            <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#374151;">
              <strong style="color:#111827;">${escapeHtml(senderName)}</strong> sent you a reminder about a task on
              <strong style="color:#111827;">${escapeHtml(projectDetails.name)}</strong>.
            </p>
            <p style="margin:0;padding:14px 16px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px;font-size:17px;font-weight:600;color:#111827;">
              ${escapeHtml(taskTitle)}
            </p>
            ${locationBlock}
            <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Reply to this email if you have questions.</p>`;

        const htmlBody = buildTransactionalShell({
            title: subject,
            headline: 'Task reminder',
            bodyHtml,
            preheader: `${senderName} reminded you about ${taskTitle}.`,
        });

        const textBody = [
            `${senderName} sent a reminder about "${taskTitle}" on ${projectDetails.name}.`,
            projectDetails.address ? `Location: ${projectDetails.address}` : null,
            '',
            buildComplianceFooterText(),
        ].filter(Boolean).join('\n');

        const { error } = await supabaseClient.functions.invoke('send-email', {
            body: { to: contactEmail, subject, html: htmlBody, text: textBody },
        });

        if (error) {
            return { success: false, error: error.message || 'Failed to send email' };
        }
        return { success: true };
    } catch (error) {
        console.error('Error in sendTaskPingEmail:', error);
        return { success: false, error: error.message || 'Unknown error' };
    }
}

/**
 * Send calendar event invitation email to attendee
 */
export async function sendCalendarInvitationEmail(attendeeEmail, eventDetails, organizerName) {
    try {
        if (!attendeeEmail || !attendeeEmail.includes('@')) {
            return { success: false, error: 'Invalid email address' };
        }

        const formatDate = (dateTimeString) => {
            if (!dateTimeString) return 'TBD';
            return new Date(dateTimeString).toLocaleDateString(i18n.language || 'en', {
                weekday: 'long',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            });
        };

        const formatTime = (dateTimeString) => {
            if (!dateTimeString) return 'TBD';
            return new Date(dateTimeString).toLocaleTimeString(i18n.language || 'en', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
            });
        };

        const eventDate = formatDate(eventDetails.start_time);
        const timeRange = eventDetails.is_all_day
            ? 'All day'
            : `${formatTime(eventDetails.start_time)} – ${formatTime(eventDetails.end_time)}`;
        const location = eventDetails.location || 'Remote';

        const subject = `Event scheduled: ${eventDetails.title || 'Event'}`;

        const notesBlock = eventDetails.description
            ? `<tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#6b7280;font-weight:500;">Notes</p><p style="margin:4px 0 0;font-size:15px;color:#111827;white-space:pre-wrap;">${escapeHtml(eventDetails.description)}</p></td></tr>`
            : '';

        const bodyHtml = `
            <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#374151;">
              <strong style="color:#111827;">${escapeHtml(organizerName)}</strong> scheduled an event:
              <strong style="color:#111827;">${escapeHtml(eventDetails.title || 'Event')}</strong>.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;">
              <tr><td style="padding:16px 18px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
                  <tr><td style="padding:0 0 10px;"><p style="margin:0;font-size:12px;color:#6b7280;font-weight:500;">Date</p><p style="margin:4px 0 0;font-size:15px;color:#111827;">${escapeHtml(eventDate)}</p></td></tr>
                  <tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#6b7280;font-weight:500;">Time</p><p style="margin:4px 0 0;font-size:15px;color:#111827;">${escapeHtml(timeRange)}</p></td></tr>
                  <tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#6b7280;font-weight:500;">Location</p><p style="margin:4px 0 0;font-size:15px;color:#111827;">${escapeHtml(location)}</p></td></tr>
                  ${notesBlock}
                </table>
              </td></tr>
            </table>`;

        const htmlBody = buildTransactionalShell({
            title: subject,
            headline: eventDetails.title || 'New event',
            bodyHtml,
            preheader: `${organizerName} scheduled ${eventDetails.title || 'an event'}.`,
        });

        const textBody = [
            `${organizerName} scheduled an event: ${eventDetails.title || 'Event'}`,
            '',
            `Date: ${eventDate}`,
            `Time: ${timeRange}`,
            `Location: ${location}`,
            eventDetails.description ? `Notes: ${eventDetails.description}` : null,
            '',
            buildComplianceFooterText(),
        ].filter(Boolean).join('\n');

        const { error } = await supabaseClient.functions.invoke('send-email', {
            body: { to: attendeeEmail, subject, html: htmlBody, text: textBody },
        });

        if (error) {
            console.error('Email sending error:', error);
            return { success: false, error: error.message || 'Failed to send email' };
        }
        return { success: true };
    } catch (error) {
        console.error('Error in sendCalendarInvitationEmail:', error);
        return { success: false, error: error.message || 'Unknown error' };
    }
}
