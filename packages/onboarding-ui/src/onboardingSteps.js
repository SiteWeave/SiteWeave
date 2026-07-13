/** Killer-feature tour steps for web/desktop office onboarding (no calendar/events). */
export const onboardingSteps = [
  {
    id: 'command-center',
    view: 'Dashboard',
    selector: '[data-onboarding="dashboard-welcome"]',
    title: 'Your office command center',
    description:
      'This is where you run jobs from the office — projects, schedules, progress reports, and your team all live here.',
    position: 'bottom',
    action: null,
  },
  {
    id: 'start-job',
    view: 'Dashboard',
    selector: '[data-onboarding="new-project-btn"]',
    title: 'Start a job fast',
    description:
      'Create a project from scratch, from a starter template, or import a schedule. Templates come pre-loaded with phases and tasks.',
    position: 'bottom',
    action: null,
  },
  {
    id: 'plan-schedule',
    view: 'Projects',
    projectTab: 'gantt',
    selector: '[data-onboarding="gantt-section"]',
    title: 'Plan the whole job',
    description:
      'Break work into phases, set dependencies, and manage the Gantt schedule. This is office-only power your field app does not replace.',
    position: 'top',
    action: null,
  },
  {
    id: 'progress-reports',
    view: 'Dashboard',
    selector: '[data-onboarding="progress-reports"]',
    title: 'Progress reports clients love',
    description:
      'Send branded PDF snapshots to clients, architects, and inspectors — on demand or on a schedule. Your logo and colors from setup appear here.',
    position: 'bottom',
    action: null,
  },
  {
    id: 'bring-team',
    view: 'Organization',
    selector: '[data-onboarding="team-invite"]',
    title: 'Bring your team',
    description:
      'Invite PMs, supers, and trade partners with the right role. Owners manage billing; PMs edit schedules; guests see only their projects.',
    position: 'left',
    action: 'complete',
  },
];

export function getStepsByView(view) {
  return onboardingSteps.filter((step) => step.view === view);
}

export function getStepById(id) {
  return onboardingSteps.find((step) => step.id === id);
}

export function getTotalSteps() {
  return onboardingSteps.length;
}
