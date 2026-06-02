import { supabaseClient } from '../context/AppContext';

const SITEWEAVE_LOGO_URL = 'https://app.siteweave.org/logo.svg';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatEmailDueDate(iso) {
    if (!iso) return null;
    const trimmed = String(iso).trim();
    const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (ymd) {
        const dt = new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])));
        return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Send task assignment email to external contact
 * @param {string} contactEmail - Email address of the contact
 * @param {object} taskDetails - Details of the task/issue step
 * @param {object} projectDetails - Details of the project
 * @param {string} assignerName - Name of the person assigning the task
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendTaskAssignmentEmail(contactEmail, taskDetails, projectDetails, assignerName) {
    try {
        // Validate email
        if (!contactEmail || !contactEmail.includes('@')) {
            return { success: false, error: 'Invalid email address' };
        }

        // Construct email content
        const subject = `New Task Assignment: ${taskDetails.title || 'Issue Step'}`;
        const safeAssigner = escapeHtml(assignerName);
        const safeProject = escapeHtml(projectDetails.name);
        const safeAddress = projectDetails.address ? escapeHtml(projectDetails.address) : '';
        const taskLabel = taskDetails.issueTitle ? 'Step' : 'Task';
        const taskName = escapeHtml(taskDetails.description || taskDetails.title || 'Task');
        const safeIssue = taskDetails.issueTitle ? escapeHtml(taskDetails.issueTitle) : '';
        const dueFormatted = formatEmailDueDate(taskDetails.dueDate);

        const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Task Assignment</title>
</head>
<body style="margin:0;padding:40px 20px;background:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#1a1a1a;-webkit-font-smoothing:antialiased;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;margin:0 auto;border-collapse:collapse;">
        <tr>
            <td>
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e6ebf1;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(15,23,42,0.06);">
                    <tr>
                        <td style="padding:36px 40px 24px;text-align:center;border-bottom:1px solid #e5e7eb;">
                            <img src="${SITEWEAVE_LOGO_URL}" alt="SiteWeave" width="120" style="display:block;width:120px;height:auto;margin:0 auto;border:0;">
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:32px 40px 8px;">
                            <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:600;color:#111827;letter-spacing:-0.02em;">New task assignment</h1>
                            <p style="margin:12px 0 0;font-size:16px;line-height:1.5;color:#4b5563;">
                                <strong style="color:#111827;">${safeAssigner}</strong> assigned you a task on <strong style="color:#111827;">${safeProject}</strong>.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:16px 40px 24px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
                                <tr>
                                    <td style="padding:20px 22px;">
                                        ${taskDetails.issueTitle ? `
                                        <p style="margin:0 0 14px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;">Issue</p>
                                        <p style="margin:0 0 18px;font-size:15px;line-height:1.45;color:#111827;">${safeIssue}</p>` : ''}
                                        <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;">${taskLabel}</p>
                                        <p style="margin:0;font-size:18px;line-height:1.35;font-weight:600;color:#111827;letter-spacing:-0.01em;">${taskName}</p>
                                        ${dueFormatted ? `
                                        <p style="margin:18px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;">Due date</p>
                                        <p style="margin:6px 0 0;font-size:16px;line-height:1.4;font-weight:600;color:#1e40af;">${escapeHtml(dueFormatted)}</p>` : ''}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 40px 28px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
                                <tr>
                                    <td style="padding:10px 0;border-top:1px solid #f3f4f6;">
                                        <p style="margin:0;font-size:13px;color:#6b7280;font-weight:500;">Project</p>
                                        <p style="margin:4px 0 0;font-size:15px;color:#111827;">${safeProject}</p>
                                    </td>
                                </tr>
                                ${safeAddress ? `
                                <tr>
                                    <td style="padding:10px 0;border-top:1px solid #f3f4f6;">
                                        <p style="margin:0;font-size:13px;color:#6b7280;font-weight:500;">Location</p>
                                        <p style="margin:4px 0 0;font-size:15px;color:#111827;">${safeAddress}</p>
                                    </td>
                                </tr>` : ''}
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:24px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
                            <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">This email was sent from SiteWeave Project Management.</p>
                            <p style="margin:8px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">Questions? Reply to this email or contact ${safeAssigner}.</p>
                            <p style="margin:16px 0 0;font-size:12px;"><a href="https://siteweave.org" style="color:#3b82f6;text-decoration:none;font-weight:500;">siteweave.org</a></p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `.trim();

        const textBody = `
New Task Assignment

${assignerName} assigned you a task on the ${projectDetails.name} project.

${taskDetails.issueTitle ? `Issue: ${taskDetails.issueTitle}\n` : ''}${taskLabel}: ${taskDetails.description || taskDetails.title || 'Task'}
${dueFormatted ? `Due Date: ${dueFormatted}\n` : ''}
Project: ${projectDetails.name}
${projectDetails.address ? `Location: ${projectDetails.address}\n` : ''}

---
This email was sent from SiteWeave Project Management
Questions? Reply to this email or contact ${assignerName}.
        `.trim();

        // Use Supabase edge function to send email
        // Note: This requires a Supabase edge function to be deployed
        // For now, we'll use a placeholder that can be replaced with actual implementation
        
        const { data, error } = await supabaseClient.functions.invoke('send-email', {
            body: {
                to: contactEmail,
                subject: subject,
                html: htmlBody,
                text: textBody
            }
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
 * @param {string} contactEmail - Email address of the contact
 * @param {object} updateDetails - Details of the update
 * @param {object} projectDetails - Details of the project
 * @param {string} updaterName - Name of the person making the update
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendTaskUpdateEmail(contactEmail, updateDetails, projectDetails, updaterName) {
    try {
        if (!contactEmail || !contactEmail.includes('@')) {
            return { success: false, error: 'Invalid email address' };
        }

        const subject = `Task Update: ${updateDetails.issueTitle || 'Your Task'}`;
        const htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #3b82f6; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 14px; color: #6b7280; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>📢 Task Update</h2>
        </div>
        <div class="content">
            <p>${updaterName} posted an update on your task:</p>
            <blockquote style="border-left: 3px solid #3b82f6; padding-left: 15px; margin: 20px 0; color: #4b5563;">
                ${updateDetails.message}
            </blockquote>
            <p>Project: <strong>${projectDetails.name}</strong></p>
        </div>
        <div class="footer">
            <p>Reply to this email to respond</p>
        </div>
    </div>
</body>
</html>
        `.trim();

        const { data, error } = await supabaseClient.functions.invoke('send-email', {
            body: {
                to: contactEmail,
                subject: subject,
                html: htmlBody
            }
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

        const subject = `Reminder: ${taskDetails.title || 'Task'} — ${projectDetails.name}`;
        const safeTitle = String(taskDetails.title || 'Task').replace(/</g, '&lt;');
        const safeProject = String(projectDetails.name || 'Project').replace(/</g, '&lt;');
        const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
  <p><strong>${senderName}</strong> asked us to send you a quick reminder about a task on <strong>${safeProject}</strong>.</p>
  <p style="margin: 16px 0; padding: 12px 16px; background: #f3f4f6; border-radius: 8px;"><strong>${safeTitle}</strong></p>
  ${projectDetails.address ? `<p>Location: ${String(projectDetails.address).replace(/</g, '&lt;')}</p>` : ''}
  <p style="color: #6b7280; font-size: 14px;">Reply to this email if you have questions.</p>
</body>
</html>`.trim();

        const textBody = `${senderName} sent a reminder about "${taskDetails.title || 'Task'}" on ${projectDetails.name}.\n${projectDetails.address ? `Location: ${projectDetails.address}\n` : ''}`;

        const { error } = await supabaseClient.functions.invoke('send-email', {
            body: {
                to: contactEmail,
                subject,
                html: htmlBody,
                text: textBody,
            },
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
 * @param {string} attendeeEmail - Email address of the attendee
 * @param {object} eventDetails - Details of the calendar event
 * @param {string} organizerName - Name of the event organizer
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendCalendarInvitationEmail(attendeeEmail, eventDetails, organizerName) {
    try {
        // Validate email
        if (!attendeeEmail || !attendeeEmail.includes('@')) {
            return { success: false, error: 'Invalid email address' };
        }

        // Format date and time
        const formatDate = (dateTimeString) => {
            if (!dateTimeString) return 'TBD';
            const date = new Date(dateTimeString);
            return date.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
        };

        const formatTime = (dateTimeString) => {
            if (!dateTimeString) return 'TBD';
            const date = new Date(dateTimeString);
            return date.toLocaleTimeString('en-US', { 
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        };

        const eventDate = formatDate(eventDetails.start_time);
        const startTime = eventDetails.is_all_day ? 'All Day' : formatTime(eventDetails.start_time);
        const endTime = eventDetails.is_all_day ? '' : formatTime(eventDetails.end_time);
        const timeRange = eventDetails.is_all_day ? 'All Day' : `${startTime} - ${endTime}`;
        
        // Generate calendar links (placeholders - to be wired up later)
        const generateGoogleCalendarLink = () => {
            // TODO: Implement Google Calendar link generation
            return '#';
        };

        const generateOutlookLink = () => {
            // TODO: Implement Outlook link generation
            return '#';
        };

        const generateICSDownloadLink = () => {
            // TODO: Implement .ics file generation and download link
            return '#';
        };

        const googleCalendarLink = generateGoogleCalendarLink();
        const outlookLink = generateOutlookLink();
        const icsLink = generateICSDownloadLink();

        // Construct email content
        const subject = `New Event: ${eventDetails.title || 'Event'}`;
        const htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
            line-height: 1.6; 
            color: #1a1a1a; 
            background: #f6f9fc; 
            padding: 40px 20px; 
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        .email-wrapper { 
            max-width: 600px; 
            margin: 0 auto; 
        }
        .card { 
            background: #ffffff; 
            border-radius: 8px; 
            border: 1px solid #e6ebf1;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
            overflow: hidden;
        }
        .header { 
            background: #ffffff; 
            padding: 48px 40px 24px 40px; 
            text-align: center; 
            border-bottom: 1px solid #e5e7eb;
        }
        .logo-img {
            width: 150px;
            height: auto;
            margin: 0 auto 24px auto;
            display: block;
        }
        .content { 
            padding: 40px; 
        }
        .headline { 
            font-size: 24px; 
            font-weight: 600; 
            color: #1a1a1a; 
            margin: 0 0 8px 0;
            line-height: 1.3;
        }
        .sub-headline {
            font-size: 16px;
            color: #4b5563;
            margin: 0 0 32px 0;
        }
        .event-details-box {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 24px;
            margin: 24px 0;
        }
        .detail-row {
            display: flex;
            align-items: flex-start;
            margin: 16px 0;
        }
        .detail-row:first-child {
            margin-top: 0;
        }
        .detail-row:last-child {
            margin-bottom: 0;
        }
        .detail-icon {
            font-size: 18px;
            margin-right: 12px;
            flex-shrink: 0;
            margin-top: 2px;
        }
        .detail-content {
            flex: 1;
        }
        .detail-label {
            font-size: 13px;
            color: #6b7280;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
        }
        .detail-value {
            font-size: 15px;
            color: #1a1a1a;
            line-height: 1.5;
        }
        .notes-value {
            white-space: pre-wrap;
        }
        .calendar-actions {
            margin: 32px 0;
            padding-top: 32px;
            border-top: 1px solid #e5e7eb;
        }
        .calendar-actions-title {
            font-size: 14px;
            font-weight: 600;
            color: #1a1a1a;
            margin-bottom: 16px;
            text-align: center;
        }
        .calendar-buttons {
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
        }
        .calendar-button {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            color: #1a1a1a;
            text-decoration: none;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
        }
        .calendar-button:hover {
            background: #f9fafb;
            border-color: #d1d5db;
        }
        .calendar-button-icon {
            font-size: 16px;
        }
        .footer { 
            background: #f9fafb; 
            padding: 32px 40px; 
            text-align: center; 
            border-top: 1px solid #e5e7eb;
        }
        .footer-text {
            font-size: 12px; 
            color: #6b7280; 
            line-height: 1.6;
            margin: 0 0 8px 0;
        }
        .footer-text:last-child {
            margin: 0;
        }
        .footer-compliance {
            font-size: 11px;
            color: #9ca3af;
            line-height: 1.5;
            margin: 16px 0 0 0;
            padding-top: 16px;
            border-top: 1px solid #e5e7eb;
        }
        .footer-compliance p {
            margin: 0 0 4px 0;
        }
        .footer-compliance p:last-child {
            margin: 0;
        }
        .footer-link {
            color: #4b5563;
            text-decoration: none;
        }
        .footer-link:hover {
            text-decoration: underline;
        }
        @media only screen and (max-width: 600px) {
            body { padding: 20px 12px; }
            .header { padding: 32px 24px 16px 24px; }
            .content { padding: 32px 24px; }
            .footer { padding: 24px; }
            .headline { font-size: 20px; }
            .calendar-buttons {
                flex-direction: column;
            }
            .calendar-button {
                width: 100%;
                justify-content: center;
            }
        }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="card">
            <div class="header">
                <img src="https://app.siteweave.org/logo.svg" alt="SiteWeave" class="logo-img" />
            </div>
            <div class="content">
                <h2 class="headline">New Event: ${eventDetails.title || 'Event'}</h2>
                <p class="sub-headline"><strong>${organizerName}</strong> has scheduled an event.</p>
                
                <div class="event-details-box">
                    <div class="detail-row">
                        <span class="detail-icon">📅</span>
                        <div class="detail-content">
                            <div class="detail-label">Date</div>
                            <div class="detail-value">${eventDate}</div>
                        </div>
                    </div>
                    <div class="detail-row">
                        <span class="detail-icon">⏰</span>
                        <div class="detail-content">
                            <div class="detail-label">Time</div>
                            <div class="detail-value">${timeRange}</div>
                        </div>
                    </div>
                    ${eventDetails.location ? `
                    <div class="detail-row">
                        <span class="detail-icon">📍</span>
                        <div class="detail-content">
                            <div class="detail-label">Location</div>
                            <div class="detail-value">${eventDetails.location}</div>
                        </div>
                    </div>` : `
                    <div class="detail-row">
                        <span class="detail-icon">📍</span>
                        <div class="detail-content">
                            <div class="detail-label">Location</div>
                            <div class="detail-value">Remote</div>
                        </div>
                    </div>`}
                    ${eventDetails.description ? `
                    <div class="detail-row">
                        <span class="detail-icon">📝</span>
                        <div class="detail-content">
                            <div class="detail-label">Notes</div>
                            <div class="detail-value notes-value">${eventDetails.description}</div>
                        </div>
                    </div>` : ''}
                </div>

                <div class="calendar-actions">
                    <div class="calendar-actions-title">Add to Calendar</div>
                    <div class="calendar-buttons">
                        <a href="${googleCalendarLink}" class="calendar-button">
                            <span class="calendar-button-icon">📅</span>
                            <span>Google Calendar</span>
                        </a>
                        <a href="${outlookLink}" class="calendar-button">
                            <span class="calendar-button-icon">📧</span>
                            <span>Outlook</span>
                        </a>
                        <a href="${icsLink}" class="calendar-button">
                            <span class="calendar-button-icon">⬇️</span>
                            <span>Download .ics</span>
                        </a>
                    </div>
                </div>
            </div>
            <div class="footer">
                <p class="footer-text">
                    <a href="https://siteweave.org" class="footer-link">siteweave.org</a>
                </p>
                <div class="footer-compliance">
                    <p>© 2026 SiteWeave. All rights reserved.</p>
                    <p>2965 Hero Way Ste 100 Leander, TX 78641</p>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
        `.trim();

        const textBody = `
New Event: ${eventDetails.title || 'Event'}

${organizerName} has scheduled an event.

EVENT DETAILS:
Date: ${eventDate}
Time: ${timeRange}
${eventDetails.location ? `Location: ${eventDetails.location}\n` : 'Location: Remote\n'}${eventDetails.description ? `Notes: ${eventDetails.description}\n` : ''}

Add to Calendar:
- Google Calendar: ${googleCalendarLink}
- Outlook: ${outlookLink}
- Download .ics: ${icsLink}

---
© 2026 SiteWeave. All rights reserved.
2965 Hero Way Ste 100 Leander, TX 78641
siteweave.org
        `.trim();

        // Use Supabase edge function to send email
        const { data, error } = await supabaseClient.functions.invoke('send-email', {
            body: {
                to: attendeeEmail,
                subject: subject,
                html: htmlBody,
                text: textBody
            }
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


