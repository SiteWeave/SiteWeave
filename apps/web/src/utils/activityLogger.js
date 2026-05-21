import { supabaseClient } from '../context/AppContext';

/**
 * Log an activity to the activity_log table
 * @param {Object} params - Activity parameters
 * @param {string} params.action - Action performed (e.g., 'created', 'completed', 'updated', 'deleted')
 * @param {string} params.entityType - Type of entity (e.g., 'task', 'project', 'file', 'contact')
 * @param {string} params.entityId - ID of the entity
 * @param {string} params.entityName - Human-readable name of the entity
 * @param {string} params.projectId - Associated project ID
 * @param {Object} params.user - User object with id, name, avatar
 * @param {Object} params.details - Additional context (optional)
 */
export async function logActivity({
    action,
    entityType,
    entityId,
    entityName,
    projectId,
    user,
    details = null,
    organizationId = null,
}) {
    try {
        if (!user || !user.id) {
            console.warn('Cannot log activity: user not provided');
            return;
        }

        let orgId = organizationId;
        if (!orgId && projectId) {
            const { data: proj, error: projErr } = await supabaseClient
                .from('projects')
                .select('organization_id')
                .eq('id', projectId)
                .maybeSingle();
            if (projErr) console.error('activity_log: could not resolve organization:', projErr);
            orgId = proj?.organization_id ?? null;
        }
        if (!orgId) {
            console.warn('Cannot log activity: missing organization_id (set organizationId or projectId)');
            return;
        }

        const activityData = {
            user_id: user.id,
            organization_id: orgId,
            user_name: user.user_metadata?.full_name || user.email || 'Unknown User',
            user_avatar: user.user_metadata?.avatar_url || null,
            action,
            entity_type: entityType,
            entity_id: entityId,
            entity_name: entityName,
            project_id: projectId,
            details: details ?? null,
        };

        const { error } = await supabaseClient
            .from('activity_log')
            .insert(activityData);

        if (error) {
            console.error('Error logging activity:', error);
        } else {
            console.log('Activity logged:', action, entityType, entityName);
        }
    } catch (error) {
        console.error('Error in logActivity:', error);
    }
}

/**
 * Helper functions for common activity types
 */

export function logTaskCreated(task, user, projectId) {
    return logActivity({
        action: 'created',
        entityType: 'task',
        entityId: task.id,
        entityName: task.text,
        projectId: projectId,
        organizationId: task.organization_id,
        user,
        details: { priority: task.priority, due_date: task.due_date }
    });
}

export function logTaskCompleted(task, user, projectId) {
    return logActivity({
        action: 'completed',
        entityType: 'task',
        entityId: task.id,
        entityName: task.text,
        projectId: projectId,
        organizationId: task.organization_id,
        user
    });
}

export function logTaskUncompleted(task, user, projectId) {
    return logActivity({
        action: 'uncompleted',
        entityType: 'task',
        entityId: task.id,
        entityName: task.text,
        projectId: projectId,
        organizationId: task.organization_id,
        user
    });
}

export function logTaskUpdated(task, user, projectId, changes) {
    return logActivity({
        action: 'updated',
        entityType: 'task',
        entityId: task.id,
        entityName: task.text,
        projectId: projectId,
        organizationId: task.organization_id,
        user,
        details: changes
    });
}

export function logTaskDeleted(task, user, projectId) {
    return logActivity({
        action: 'deleted',
        entityType: 'task',
        entityId: task.id,
        entityName: task.text,
        projectId: projectId,
        organizationId: task.organization_id,
        user
    });
}

/** kind: 'assignment' | 'ping' — proof of immediate email to assignee */
export function logTaskAssigneeEmailSent({
    task,
    user,
    projectId,
    kind,
    recipientEmail,
    success,
    errorMessage,
    channel = 'email',
}) {
    let action;
    if (kind === 'ping') {
        action = channel === 'sms' ? 'assignee_ping_sms' : 'assignee_ping_email';
    } else {
        action = 'assignee_assignment_email';
    }
    return logActivity({
        action,
        entityType: 'task',
        entityId: task.id,
        entityName: task.text,
        projectId,
        organizationId: task.organization_id,
        user,
        details: {
            kind,
            channel,
            recipient_email: recipientEmail,
            success: success !== false,
            error: errorMessage || null,
        },
    });
}

export function logProjectCreated(project, user) {
    return logActivity({
        action: 'created',
        entityType: 'project',
        entityId: project.id,
        entityName: project.name,
        projectId: project.id,
        organizationId: project.organization_id,
        user
    });
}

export function logFileUploaded(file, user, projectId) {
    return logActivity({
        action: 'uploaded',
        entityType: 'file',
        entityId: file.id,
        entityName: file.name,
        projectId: projectId,
        organizationId: file.organization_id ?? null,
        user,
        details: { file_type: file.type, size_kb: file.size_kb }
    });
}

export function logContactCreated(contact, user, projectId = null) {
    return logActivity({
        action: 'created',
        entityType: 'contact',
        entityId: contact.id,
        entityName: contact.name,
        projectId: projectId,
        organizationId: contact.organization_id,
        user,
        details: { role: contact.role, type: contact.type }
    });
}

export function logContactUpdated(contact, user, changes) {
    return logActivity({
        action: 'updated',
        entityType: 'contact',
        entityId: contact.id,
        entityName: contact.name,
        projectId: null,
        organizationId: contact.organization_id,
        user,
        details: changes && typeof changes === 'object' ? changes : {}
    });
}

/**
 * Log a weather / schedule impact record (project-level).
 */
export function logWeatherImpactRecorded(impact, user, projectId, organizationId) {
    return logActivity({
        action: 'created',
        entityType: 'weather_impact',
        entityId: impact.id,
        entityName: impact.title || 'Weather impact',
        projectId,
        organizationId,
        user,
        details: {
            impact_type: impact.impact_type,
            days_lost: impact.days_lost,
            start_date: impact.start_date,
            end_date: impact.end_date,
            apply_cascade: impact.apply_cascade,
            schedule_shift_applied: impact.schedule_shift_applied,
            affected_task_ids: impact.affected_task_ids,
            affected_phase_ids: impact.affected_phase_ids,
        },
    });
}

/**
 * Log when a weather impact's schedule shift was applied to tasks/phases.
 */
export function logWeatherImpactScheduleApplied(impact, user, projectId, organizationId, extra = {}) {
    return logActivity({
        action: 'updated',
        entityType: 'weather_impact',
        entityId: impact.id,
        entityName: impact.title || 'Weather impact',
        projectId,
        organizationId,
        user,
        details: {
            event: 'schedule_shift_applied',
            days_lost: impact.days_lost,
            ...extra,
        },
    });
}

export function logFieldIssueCreated(issue, user, projectId) {
    return logActivity({
        action: 'created',
        entityType: 'field_issue',
        entityId: String(issue.id),
        entityName: issue.title,
        projectId,
        user,
        details: { priority: issue.priority },
    });
}

export function logFieldIssueUpdated(issue, user, projectId) {
    return logActivity({
        action: 'updated',
        entityType: 'field_issue',
        entityId: String(issue.id),
        entityName: issue.title,
        projectId,
        user,
    });
}

export function logFieldIssueClosed(issue, user, projectId) {
    return logActivity({
        action: 'completed',
        entityType: 'field_issue',
        entityId: String(issue.id),
        entityName: issue.title,
        projectId,
        user,
        details: { status: 'closed' },
    });
}
