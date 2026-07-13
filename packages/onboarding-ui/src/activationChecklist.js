/** Office activation checklist items (distinct from mobile field checklist). */
export const ACTIVATION_ITEMS = [
  { id: 'workspace', icon: 'workspace', alwaysDone: true },
  { id: 'project', icon: 'project' },
  { id: 'schedule', icon: 'schedule' },
  { id: 'team', icon: 'team' },
  { id: 'report', icon: 'report' },
];

export function computeActivationState({
  projectCount = 0,
  hasPhasesOrGantt = false,
  teamInviteSent = false,
  reportCount = 0,
} = {}) {
  return {
    workspace: true,
    project: projectCount > 0,
    schedule: hasPhasesOrGantt,
    team: teamInviteSent,
    report: reportCount > 0,
  };
}

export function getActivationProgress(completed) {
  const items = ACTIVATION_ITEMS;
  const done = items.filter((item) => completed[item.id]).length;
  return { done, total: items.length, percent: Math.round((done / items.length) * 100) };
}

export function isActivationComplete(completed) {
  return ACTIVATION_ITEMS.every((item) => item.alwaysDone || completed[item.id]);
}
