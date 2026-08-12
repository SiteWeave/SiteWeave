/**
 * SiteWeave schedule → Microsoft Project XML (MSPDI).
 * Emits schema-oriented Project XML that opens as a structured outline in MS Project.
 */

import {
  addBusinessDays,
  buildFederalHolidayMap,
  inclusiveBusinessDaysInRange,
  toIsoDateUtc,
} from '../../../../packages/core-logic/src/utils/usBusinessCalendar.js';
import {
  mapDependencyTypeToMsLinkType,
  mapLagDaysToLinkLag,
} from './msProjectImportMapping.js';
import { MSP_NS } from './msProjectXmlParser.js';

export const MINUTES_PER_DAY = 480;
export const DAYS_PER_WEEK = 5;
export const SITEWEAVE_CALENDAR_UID = 1;

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {string} value
 */
export function escapeXml(value) {
  const raw = String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
  const wellFormed = typeof raw.toWellFormed === 'function' ? raw.toWellFormed() : raw;
  return wellFormed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncateText(value, maxLength) {
  return Array.from(String(value ?? '')).slice(0, maxLength).join('');
}

/**
 * @param {string} name
 */
export function sanitizeMsProjectFilename(name) {
  const base = String(name || 'project')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim();
  const safe = base || 'project';
  return `${safe}-schedule.xml`;
}

/**
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
function normalizeDateOnly(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (DATE_ONLY_RE.test(s)) {
    const d = new Date(`${s}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s) return s;
    return null;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * @param {string} dateOnly YYYY-MM-DD
 * @param {string} time HH:MM:SS
 */
function toMsDateTime(dateOnly, time) {
  return `${dateOnly}T${time}`;
}

/**
 * Inclusive working-day duration in ISO 8601 (PT#H0M0S).
 * @param {number} durationDays
 * @param {boolean} isMilestone
 */
export function formatDurationIso(durationDays, isMilestone = false) {
  if (isMilestone) return 'PT0H0M0S';
  const days = Number.isFinite(Number(durationDays))
    ? Math.max(0, Number(durationDays))
    : 1;
  const hours = Math.round(days * (MINUTES_PER_DAY / 60));
  return `PT${hours}H0M0S`;
}

/**
 * @param {object} task
 * @returns {{ start: string|null, finish: string|null, durationDays: number|null, percentComplete: number, warnings: string[] }}
 */
function normalizeTaskSchedule(task) {
  const warnings = [];
  const start = normalizeDateOnly(task.start_date);
  const due = normalizeDateOnly(task.due_date);
  let durationDays = null;
  if (task.duration_days != null && task.duration_days !== '') {
    const n = Number(task.duration_days);
    if (Number.isFinite(n) && n >= 0) durationDays = n;
    else warnings.push(`invalid_duration:${task.id}`);
  }

  if (task.start_date && !start) warnings.push(`invalid_start:${task.id}`);
  if (task.due_date && !due) warnings.push(`invalid_due:${task.id}`);

  let percentComplete = 0;
  if (task.completed) {
    percentComplete = 100;
  } else if (task.percent_complete != null && task.percent_complete !== '') {
    const p = parseInt(task.percent_complete, 10);
    if (Number.isFinite(p)) percentComplete = Math.max(0, Math.min(100, p));
  }

  if (task.is_milestone) {
    const anchor = start || due;
    return {
      start: anchor,
      finish: anchor,
      durationDays: 0,
      percentComplete,
      warnings,
    };
  }

  let finish = due;
  if (start && finish && finish < start) {
    warnings.push(`finish_before_start:${task.id}`);
    finish = start;
  }

  // Preserve the visible SiteWeave date range. Microsoft Project needs a
  // duration consistent with that range and the exported working calendar.
  if (start && finish) {
    durationDays = Math.max(1, inclusiveBusinessDaysInRange(start, finish));
  }

  if (start && durationDays != null && durationDays > 0 && !finish) {
    finish = addBusinessDays(start, Math.max(0, Math.round(durationDays) - 1));
  }
  if (!durationDays && (start || finish)) durationDays = 1;

  return { start, finish, durationDays, percentComplete, warnings };
}

function compareTasks(a, b) {
  const startA = a.start_date || a.due_date || '';
  const startB = b.start_date || b.due_date || '';
  const dueA = a.due_date || a.start_date || '';
  const dueB = b.due_date || b.start_date || '';
  const key = `${startA}|${dueA}`.localeCompare(`${startB}|${dueB}`);
  if (key !== 0) return key;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

/**
 * Build outline-ordered export nodes: project summary, phases, tasks (nested).
 * @returns {{ nodes: object[], idMap: Map<string, number>, warnings: string[] }}
 */
export function buildExportOutline({ project, phases = [], tasks = [], dependencies = [] }) {
  const warnings = [];
  const byId = new Map((tasks || []).map((t) => [t.id, t]));
  const phaseList = [...(phases || [])].sort((a, b) => {
    const orderDiff = (a.order ?? 0) - (b.order ?? 0);
    return orderDiff || String(a.id || '').localeCompare(String(b.id || ''));
  });
  const phaseIds = new Set(phaseList.map((p) => p.id));

  const childrenByParent = new Map();
  const rootsByPhase = new Map(); // phaseId | '__none__' -> tasks
  rootsByPhase.set('__none__', []);

  for (const phase of phaseList) {
    rootsByPhase.set(phase.id, []);
  }

  for (const task of tasks || []) {
    const parentId = task.parent_task_id;
    if (parentId && byId.has(parentId)) {
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId).push(task);
      continue;
    }
    if (parentId && !byId.has(parentId)) {
      warnings.push(`orphaned_parent:${task.id}`);
    }
    let phaseKey = task.project_phase_id;
    if (phaseKey && !phaseIds.has(phaseKey)) {
      warnings.push(`missing_phase:${task.id}`);
      phaseKey = null;
    }
    const bucket = phaseKey && rootsByPhase.has(phaseKey) ? phaseKey : '__none__';
    rootsByPhase.get(bucket).push(task);
  }

  for (const list of childrenByParent.values()) list.sort(compareTasks);
  for (const list of rootsByPhase.values()) list.sort(compareTasks);

  /** @type {object[]} */
  const nodes = [];
  const idMap = new Map(); // siteweave task id -> MSP UID
  const visitedTaskIds = new Set();
  let nextUid = 1;

  const projectName = (project?.name || 'Project').trim() || 'Project';
  if (Array.from(projectName).length > 512) warnings.push('project_name_truncated');
  const projectSchedule = normalizeTaskSchedule({
    id: project?.id || 'project',
    start_date: project?.start_date,
    due_date: project?.due_date || project?.client_due_date,
    percent_complete: project?.progress,
  });
  warnings.push(...projectSchedule.warnings);

  nodes.push({
    kind: 'project_summary',
    uid: 0,
    id: 0,
    name: truncateText(projectName, 512),
    outlineLevel: 0,
    outlineNumber: '0',
    wbs: '0',
    summary: true,
    schedule: projectSchedule,
    predecessors: [],
  });

  /**
   * @param {object} task
   * @param {number} outlineLevel
   * @param {string} outlinePrefix
   * @param {number} indexAmongSiblings 1-based
   */
  function appendTaskTree(task, outlineLevel, outlinePrefix, indexAmongSiblings) {
    if (visitedTaskIds.has(task.id)) {
      warnings.push(`hierarchy_cycle:${task.id}`);
      return;
    }
    visitedTaskIds.add(task.id);

    const uid = nextUid++;
    const outlineNumber = outlinePrefix ? `${outlinePrefix}.${indexAmongSiblings}` : String(indexAmongSiblings);
    const schedule = normalizeTaskSchedule(task);
    warnings.push(...schedule.warnings);

    const contactName =
      task.contacts?.name ||
      task.assignee_name ||
      task.contact_name ||
      null;

    const node = {
      kind: 'task',
      siteweaveId: task.id,
      uid,
      id: uid,
      name: truncateText(task.text || 'Task', 512),
      outlineLevel,
      outlineNumber,
      wbs: outlineNumber,
      summary: false,
      schedule,
      contact: contactName,
      isMilestone: Boolean(task.is_milestone),
      predecessors: [],
    };
    if (Array.from(String(task.text || '')).length > 512) {
      warnings.push(`task_name_truncated:${task.id}`);
    }
    if (contactName && Array.from(String(contactName)).length > 512) {
      warnings.push(`contact_name_truncated:${task.id}`);
      node.contact = truncateText(contactName, 512);
    }
    idMap.set(task.id, uid);
    nodes.push(node);

    const children = childrenByParent.get(task.id) || [];
    if (children.length > 0) {
      node.summary = true;
      children.forEach((child, i) => appendTaskTree(child, outlineLevel + 1, outlineNumber, i + 1));
    }
  }

  let phaseOrdinal = 0;
  for (const phase of phaseList) {
    phaseOrdinal += 1;
    const phaseUid = nextUid++;
    const outlineNumber = String(phaseOrdinal);
    const phaseSchedule = normalizeTaskSchedule({
      id: `phase:${phase.id}`,
      start_date: phase.start_date,
      due_date: phase.end_date,
      percent_complete: phase.progress,
    });
    warnings.push(...phaseSchedule.warnings);
    const phaseNode = {
      kind: 'phase',
      siteweaveId: phase.id,
      uid: phaseUid,
      id: phaseUid,
      name: truncateText(phase.name || `Phase ${phaseOrdinal}`, 512),
      outlineLevel: 1,
      outlineNumber,
      wbs: outlineNumber,
      summary: true,
      schedule: phaseSchedule,
      predecessors: [],
    };
    if (Array.from(String(phase.name || '')).length > 512) {
      warnings.push(`phase_name_truncated:${phase.id}`);
    }
    nodes.push(phaseNode);

    const roots = rootsByPhase.get(phase.id) || [];
    roots.forEach((task, i) => appendTaskTree(task, 2, outlineNumber, i + 1));
  }

  const unassigned = [...(rootsByPhase.get('__none__') || [])];
  for (const task of tasks || []) {
    if (!visitedTaskIds.has(task.id) && !unassigned.some((item) => item.id === task.id)) {
      warnings.push(`unreachable_hierarchy:${task.id}`);
      unassigned.push(task);
    }
  }
  unassigned.sort(compareTasks);

  if (unassigned.length > 0) {
    if (phaseList.length > 0) {
      phaseOrdinal += 1;
      const phaseUid = nextUid++;
      const outlineNumber = String(phaseOrdinal);
      nodes.push({
        kind: 'phase',
        siteweaveId: '__unassigned__',
        uid: phaseUid,
        id: phaseUid,
        name: 'Unassigned Tasks',
        outlineLevel: 1,
        outlineNumber,
        wbs: outlineNumber,
        summary: true,
        schedule: { start: null, finish: null, durationDays: null, percentComplete: 0 },
        predecessors: [],
      });
      unassigned.forEach((task, i) => appendTaskTree(task, 2, outlineNumber, i + 1));
    } else {
      unassigned.forEach((task, i) => appendTaskTree(task, 1, '', i + 1));
    }
  }

  // Attach predecessors on successors
  for (const dep of dependencies || []) {
    const predUid = idMap.get(dep.task_id);
    const succUid = idMap.get(dep.successor_task_id);
    if (predUid == null || succUid == null) {
      warnings.push(`orphan_dependency:${dep.id || `${dep.task_id}->${dep.successor_task_id}`}`);
      continue;
    }
    const succNode = nodes.find((n) => n.uid === succUid);
    if (!succNode) continue;
    succNode.predecessors.push({
      predecessorUid: predUid,
      type: mapDependencyTypeToMsLinkType(dep.dependency_type || 'finish_to_start'),
      linkLag: mapLagDaysToLinkLag(dep.lag_days ?? 0, MINUTES_PER_DAY),
      lagFormat: 7,
    });
  }

  applySummaryRollups(nodes);

  return { nodes, idMap, warnings: [...new Set(warnings)] };
}

/**
 * Roll Start/Finish/% complete up the outline for summary tasks.
 * @param {object[]} nodes
 */
function applySummaryRollups(nodes) {
  // Process from deepest to shallowest so parents see rolled-up children.
  const byLevel = [...nodes].sort((a, b) => b.outlineLevel - a.outlineLevel);
  for (const node of byLevel) {
    if (!node.summary) continue;
    const direct = nodes.filter((n) => {
      if (n.uid === node.uid) return false;
      if (n.outlineLevel !== node.outlineLevel + 1) return false;
      if (node.outlineNumber === '0') return n.outlineLevel === 1;
      const parts = String(n.outlineNumber).split('.');
      const parentParts = String(node.outlineNumber).split('.');
      if (parts.length !== parentParts.length + 1) return false;
      return parts.slice(0, parentParts.length).join('.') === node.outlineNumber;
    });
    if (direct.length === 0) continue;

    const starts = direct.map((c) => c.schedule?.start).filter(Boolean).sort();
    const finishes = direct.map((c) => c.schedule?.finish).filter(Boolean).sort();
    const weightedProgress = direct.reduce(
      (acc, child) => {
        const weight = Math.max(1, Number(child.schedule?.durationDays) || 1);
        return {
          weightedTotal:
            acc.weightedTotal + (child.schedule?.percentComplete ?? 0) * weight,
          weightTotal: acc.weightTotal + weight,
        };
      },
      { weightedTotal: 0, weightTotal: 0 }
    );
    node.schedule = {
      start: starts[0] || null,
      finish: finishes.length ? finishes[finishes.length - 1] : null,
      durationDays: null,
      percentComplete: weightedProgress.weightTotal
        ? Math.round(weightedProgress.weightedTotal / weightedProgress.weightTotal)
        : 0,
    };
    if (node.schedule.start && node.schedule.finish) {
      node.schedule.durationDays = Math.max(
        1,
        inclusiveBusinessDaysInRange(node.schedule.start, node.schedule.finish)
      );
    }
  }
}

/**
 * US federal holidays (observed) overlapping the schedule window, as weekday exceptions.
 * @param {string|null} start
 * @param {string|null} finish
 */
function collectHolidayExceptions(start, finish) {
  if (!start && !finish) return [];
  const lo = start && finish ? (start <= finish ? start : finish) : start || finish;
  const hi = start && finish ? (start <= finish ? finish : start) : start || finish;
  const rangeStart = new Date(`${lo}T00:00:00Z`);
  const rangeEnd = new Date(`${hi}T00:00:00Z`);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  const holidayMap = buildFederalHolidayMap(rangeStart, rangeEnd);
  const windowStart = toIsoDateUtc(rangeStart);
  const windowEnd = toIsoDateUtc(new Date(rangeEnd.getTime() - 86400000));

  return [...holidayMap]
    .filter((iso) => iso >= windowStart && iso <= windowEnd)
    .filter((iso) => {
      const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
      return dow !== 0 && dow !== 6;
    })
    .sort();
}

function el(name, content, indent = 2) {
  const pad = ' '.repeat(indent);
  if (content === null || content === undefined || content === '') {
    return `${pad}<${name} />`;
  }
  return `${pad}<${name}>${content}</${name}>`;
}

function renderWorkingWeekDays(indent = 4) {
  const lines = [];
  for (let dayType = 1; dayType <= 7; dayType += 1) {
    // DayType 1=Sunday … 7=Saturday
    const isWorking = dayType >= 2 && dayType <= 6;
    lines.push(`${' '.repeat(indent)}<WeekDay>`);
    lines.push(el('DayType', String(dayType), indent + 2));
    lines.push(el('DayWorking', isWorking ? '1' : '0', indent + 2));
    if (isWorking) {
      lines.push(`${' '.repeat(indent + 2)}<WorkingTimes>`);
      lines.push(`${' '.repeat(indent + 4)}<WorkingTime>`);
      lines.push(el('FromTime', '08:00:00', indent + 6));
      lines.push(el('ToTime', '12:00:00', indent + 6));
      lines.push(`${' '.repeat(indent + 4)}</WorkingTime>`);
      lines.push(`${' '.repeat(indent + 4)}<WorkingTime>`);
      lines.push(el('FromTime', '13:00:00', indent + 6));
      lines.push(el('ToTime', '17:00:00', indent + 6));
      lines.push(`${' '.repeat(indent + 4)}</WorkingTime>`);
      lines.push(`${' '.repeat(indent + 2)}</WorkingTimes>`);
    }
    lines.push(`${' '.repeat(indent)}</WeekDay>`);
  }
  return lines.join('\n');
}

function renderExceptions(holidays, indent = 4) {
  if (!holidays.length) return '';
  const lines = [`${' '.repeat(indent)}<Exceptions>`];
  holidays.forEach((iso) => {
    lines.push(`${' '.repeat(indent + 2)}<Exception>`);
    lines.push(el('EnteredByOccurrences', '0', indent + 4));
    lines.push(`${' '.repeat(indent + 4)}<TimePeriod>`);
    lines.push(el('FromDate', `${iso}T00:00:00`, indent + 6));
    lines.push(el('ToDate', `${iso}T23:59:59`, indent + 6));
    lines.push(`${' '.repeat(indent + 4)}</TimePeriod>`);
    lines.push(el('Occurrences', '1', indent + 4));
    lines.push(el('Name', escapeXml('US Federal Holiday'), indent + 4));
    lines.push(el('Type', '1', indent + 4));
    lines.push(el('DayWorking', '0', indent + 4));
    lines.push(`${' '.repeat(indent + 2)}</Exception>`);
  });
  lines.push(`${' '.repeat(indent)}</Exceptions>`);
  return lines.join('\n');
}

function renderTaskNode(node, indent = 4) {
  const pad = ' '.repeat(indent);
  const lines = [`${pad}<Task>`];
  lines.push(el('UID', String(node.uid), indent + 2));
  lines.push(el('ID', String(node.id), indent + 2));
  lines.push(el('Name', escapeXml(node.name), indent + 2));
  lines.push(el('Type', '1', indent + 2)); // Fixed Duration
  lines.push(el('IsNull', '0', indent + 2));

  if (node.contact) {
    lines.push(el('Contact', escapeXml(node.contact), indent + 2));
  }
  lines.push(el('WBS', escapeXml(node.wbs), indent + 2));
  lines.push(el('OutlineNumber', escapeXml(node.outlineNumber), indent + 2));
  lines.push(el('OutlineLevel', String(node.outlineLevel), indent + 2));
  lines.push(el('Priority', '500', indent + 2));

  const sched = node.schedule || {};
  if (sched.start) {
    lines.push(el('Start', toMsDateTime(sched.start, '08:00:00'), indent + 2));
  }
  if (sched.finish) {
    const finishTime = node.isMilestone ? '08:00:00' : '17:00:00';
    lines.push(el('Finish', toMsDateTime(sched.finish, finishTime), indent + 2));
  }

  const isMilestone = Boolean(node.isMilestone) && !node.summary;
  if (isMilestone || sched.durationDays != null || (sched.start && sched.finish)) {
    const dur =
      isMilestone
        ? formatDurationIso(0, true)
        : formatDurationIso(sched.durationDays ?? 1, false);
    lines.push(el('Duration', dur, indent + 2));
    lines.push(el('DurationFormat', '7', indent + 2));
  }

  lines.push(el('Milestone', isMilestone ? '1' : '0', indent + 2));
  lines.push(el('Summary', node.summary ? '1' : '0', indent + 2));
  lines.push(el('PercentComplete', String(sched.percentComplete ?? 0), indent + 2));
  lines.push(el('CalendarUID', String(SITEWEAVE_CALENDAR_UID), indent + 2));

  for (const pred of node.predecessors || []) {
    lines.push(`${pad}  <PredecessorLink>`);
    lines.push(el('PredecessorUID', String(pred.predecessorUid), indent + 4));
    lines.push(el('Type', String(pred.type), indent + 4));
    lines.push(el('CrossProject', '0', indent + 4));
    lines.push(el('LinkLag', String(pred.linkLag ?? 0), indent + 4));
    lines.push(el('LagFormat', String(pred.lagFormat ?? 7), indent + 4));
    lines.push(`${pad}  </PredecessorLink>`);
  }

  lines.push(`${pad}</Task>`);
  return lines.join('\n');
}

/**
 * Build MSPDI XML string.
 * @param {{ project: object, phases?: object[], tasks?: object[], dependencies?: object[] }} input
 * @returns {{ xml: string, warnings: string[], filename: string, metrics: object }}
 */
export function buildMsProjectXml(input) {
  const project = input?.project || {};
  const { nodes, warnings } = buildExportOutline({
    project,
    phases: input?.phases || [],
    tasks: input?.tasks || [],
    dependencies: input?.dependencies || [],
  });

  const dated = nodes
    .map((n) => n.schedule)
    .filter((s) => s && (s.start || s.finish));
  const allStarts = dated.map((s) => s.start).filter(Boolean).sort();
  const allFinishes = dated.map((s) => s.finish).filter(Boolean).sort();
  const projectStartCandidates = [
    normalizeDateOnly(project.start_date),
    allStarts[0],
  ].filter(Boolean).sort();
  const projectStart = projectStartCandidates[0] || toIsoDateUtc(new Date());
  const projectFinishCandidates = [
    normalizeDateOnly(project.due_date),
    normalizeDateOnly(project.client_due_date),
    allFinishes[allFinishes.length - 1],
    projectStart,
  ].filter(Boolean).sort();
  const projectFinish =
    projectFinishCandidates[projectFinishCandidates.length - 1] || projectStart;

  const holidays = collectHolidayExceptions(projectStart, projectFinish);
  const projectName = (project.name || 'Project').trim() || 'Project';
  const projectXmlName = escapeXml(truncateText(projectName, 255));
  const title = escapeXml(truncateText(projectName, 512));

  const taskXml = nodes.map((n) => renderTaskNode(n)).join('\n');
  const calendarXml = [
    '  <Calendars>',
    '    <Calendar>',
    el('UID', String(SITEWEAVE_CALENDAR_UID), 6),
    el('Name', escapeXml('SiteWeave Standard'), 6),
    el('IsBaseCalendar', '1', 6),
    el('BaseCalendarUID', '-1', 6),
    '      <WeekDays>',
    renderWorkingWeekDays(8),
    '      </WeekDays>',
    renderExceptions(holidays, 6),
    '    </Calendar>',
    '  </Calendars>',
  ]
    .filter(Boolean)
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<Project xmlns="${MSP_NS}">`,
    el('SaveVersion', '12', 2),
    el('Name', projectXmlName, 2),
    el('Title', title, 2),
    el('Company', escapeXml('SiteWeave'), 2),
    el('ScheduleFromStart', '1', 2),
    el('StartDate', toMsDateTime(projectStart, '08:00:00'), 2),
    el('FinishDate', toMsDateTime(projectFinish, '17:00:00'), 2),
    el('CurrencyCode', 'USD', 2),
    el('CalendarUID', String(SITEWEAVE_CALENDAR_UID), 2),
    el('DefaultStartTime', '08:00:00', 2),
    el('DefaultFinishTime', '17:00:00', 2),
    el('MinutesPerDay', String(MINUTES_PER_DAY), 2),
    el('MinutesPerWeek', String(MINUTES_PER_DAY * DAYS_PER_WEEK), 2),
    el('DaysPerMonth', '20', 2),
    calendarXml,
    '  <Tasks>',
    taskXml,
    '  </Tasks>',
    '</Project>',
    '',
  ].join('\n');

  return {
    xml,
    warnings,
    filename: sanitizeMsProjectFilename(projectName),
    metrics: {
      taskCount: nodes.filter((n) => n.kind === 'task').length,
      phaseCount: nodes.filter((n) => n.kind === 'phase').length,
      dependencyCount: nodes.reduce((n, node) => n + (node.predecessors?.length || 0), 0),
      holidayCount: holidays.length,
    },
  };
}

/**
 * Trigger a browser download of the XML.
 * @param {string} xml
 * @param {string} filename
 */
export function downloadMsProjectXml(xml, filename) {
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'project-schedule.xml';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
