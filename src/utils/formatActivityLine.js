/**
 * Build a human-readable activity line from an activity_log row (Supabase snake_case).
 * @param {object} activity
 * @param {import('i18next').TFunction} t
 * @param {{ projectNamesById?: Record<string, string> }} [options]
 * @returns {string}
 */
export function formatActivityLine(activity, t, options = {}) {
  const projectNamesById = options.projectNamesById || {};
  const action = String(activity?.action || '').toLowerCase();
  const entityType = String(activity?.entity_type || 'item').toLowerCase();
  const entityName = activity?.entity_name != null ? String(activity.entity_name) : '';
  const details = parseActivityDetails(activity?.details);
  const projectId = activity?.project_id;
  const projectName =
    projectId && projectNamesById[projectId] ? projectNamesById[projectId] : null;
  const projectSuffix = projectName ? t('activity.project_suffix', { project: projectName }) : '';

  if (entityType === 'project_phase' && action === 'updated') {
    const oldP = details.old_progress;
    const newP = details.new_progress;
    if (oldP != null && newP != null) {
      const phase = String(details.phase_name || entityName || t('activity.fallback.phase'));
      return t('activity.phase_progress', { phase, old: oldP, new: newP, projectSuffix });
    }
  }

  if (entityType === 'project' && action === 'updated') {
    const newStatus = details.new_status ?? details.status;
    const oldStatus = details.old_status;
    if (newStatus != null || oldStatus != null) {
      const name = entityName || t('activity.fallback.project');
      return t('activity.project_status_change', {
        name,
        old: oldStatus != null ? String(oldStatus) : '—',
        new: newStatus != null ? String(newStatus) : '—',
      });
    }
    const fields = details.changed_fields;
    if (Array.isArray(fields) && fields.length > 0) {
      const name = entityName || t('activity.fallback.project');
      return t('activity.project_fields_updated', {
        name,
        fields: fields.join(', '),
      });
    }
  }

  if (entityType === 'branding' && action === 'updated') {
    return t('activity.branding_updated');
  }

  if (entityType === 'organization' && action === 'updated') {
    return t('activity.organization_updated', {
      name: entityName || t('activity.fallback.organization'),
    });
  }

  if (action === 'assignee_assignment_email' && details.recipient_email) {
    const ok = details.success !== false;
    const errorSuffix = !ok && details.error
      ? t('activity.error_suffix', { error: details.error })
      : '';
    return ok
      ? t('activity.assignment_email_sent', { email: details.recipient_email, task: entityName })
      : t('activity.assignment_email_failed', { email: details.recipient_email, task: entityName, errorSuffix });
  }
  if (action === 'assignee_ping_email' && details.recipient_email) {
    const ok = details.success !== false;
    const errorSuffix = !ok && details.error
      ? t('activity.error_suffix', { error: details.error })
      : '';
    return ok
      ? t('activity.ping_email_sent', { email: details.recipient_email, task: entityName })
      : t('activity.ping_email_failed', { email: details.recipient_email, task: entityName, errorSuffix });
  }
  if (action === 'assignee_ping_sms' && details.recipient_email) {
    const ok = details.success !== false;
    const to = details.recipient_email;
    const errorSuffix = !ok && details.error
      ? t('activity.error_suffix', { error: details.error })
      : '';
    return ok
      ? t('activity.ping_sms_sent', { phone: to, task: entityName })
      : t('activity.ping_sms_failed', { phone: to, task: entityName, errorSuffix });
  }

  const nameFor = entityName || fallbackEntityLabel(entityType, t);
  const taskDetailSuffix = formatTaskUpdateDetails(details, t);
  const contactDetailSuffix = formatGenericFieldDetails(details, t);

  if (entityType === 'task') {
    if (action === 'created') return t('activity.task.created', { name: nameFor, projectSuffix });
    if (action === 'updated')
      return t('activity.task.updated', { name: nameFor, detailSuffix: taskDetailSuffix, projectSuffix });
    if (action === 'deleted') return t('activity.task.deleted', { name: nameFor, projectSuffix });
    if (action === 'completed') return t('activity.task.completed', { name: nameFor, projectSuffix });
    if (action === 'uncompleted') return t('activity.task.uncompleted', { name: nameFor, projectSuffix });
  }

  if (entityType === 'project') {
    if (action === 'created') return t('activity.project.created', { name: nameFor });
    if (action === 'updated') return t('activity.project.updated', { name: nameFor });
    if (action === 'deleted') return t('activity.project.deleted', { name: nameFor });
  }

  if (entityType === 'file') {
    if (action === 'uploaded') return t('activity.file.uploaded', { name: nameFor, projectSuffix });
    if (action === 'deleted') return t('activity.file.deleted', { name: nameFor, projectSuffix });
  }

  if (entityType === 'contact') {
    if (action === 'created') return t('activity.contact.created', { name: nameFor });
    if (action === 'updated')
      return t('activity.contact.updated', { name: nameFor, detailSuffix: contactDetailSuffix });
    if (action === 'deleted') return t('activity.contact.deleted', { name: nameFor });
  }

  return t('activity.generic', { action, entityType: entityLabelForGeneric(entityType, t), name: nameFor, projectSuffix });
}

function fallbackEntityLabel(entityType, t) {
  const key = `activity.fallback.${entityType}`;
  const label = t(key);
  if (label !== key) return label;
  return t('activity.fallback.item');
}

function entityLabelForGeneric(entityType, t) {
  const key = `activity.entity.${entityType}`;
  const label = t(key);
  if (label !== key) return label;
  return entityType;
}

/** @param {unknown} raw */
export function parseActivityDetails(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return /** @type {Record<string, unknown>} */ (raw);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? /** @type {Record<string, unknown>} */ (parsed)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

const TASK_FIELD_LABEL_KEYS = {
  text: 'activity.field.text',
  due_date: 'activity.field.due_date',
  assignee_id: 'activity.field.assignee_id',
  priority: 'activity.field.priority',
  completed: 'activity.field.completed',
  start_date: 'activity.field.start_date',
  recurrence: 'activity.field.recurrence',
  workflow_steps: 'activity.field.workflow_steps',
};

function formatTaskUpdateDetails(details, t) {
  if (!details || typeof details !== 'object') return '';
  const keys = Object.keys(details).filter((k) => details[k] !== undefined);
  if (keys.length === 0) return '';
  const parts = keys.map((k) => {
    const lk = TASK_FIELD_LABEL_KEYS[k];
    return lk ? t(lk) : k.replace(/_/g, ' ');
  });
  if (parts.length <= 4) return t('activity.detail.changed_fields', { fields: parts.join(', ') });
  return t('activity.detail.changed_fields', { fields: t('activity.detail.multiple_fields') });
}

function formatGenericFieldDetails(details, t) {
  if (!details || typeof details !== 'object') return '';
  const keys = Object.keys(details).filter((k) => details[k] !== undefined);
  if (keys.length === 0) return '';
  if (keys.length <= 4) return t('activity.detail.changed_fields', { fields: keys.join(', ') });
  return t('activity.detail.changed_fields', { fields: t('activity.detail.multiple_fields') });
}
