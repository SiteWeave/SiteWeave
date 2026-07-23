export const ROUTE_PATHS = {
  home: '/',
  projects: '/projects',
  projectsTrash: '/projects/trash',
  project: '/projects/:id',
  projectTasks: '/projects/:id/tasks',
  projectGantt: '/projects/:id/gantt',
  projectFieldIssues: '/projects/:id/field-issues',
  projectActivity: '/projects/:id/activity',
  projectStream: '/projects/:id/stream',
  projectUpdates: '/projects/:id/updates',
  messages: '/messages',
  calendar: '/calendar',
  team: '/team',
  teamDirectory: '/team/directory',
  tradePartners: '/trade-partners',
  organization: '/organization',
  settings: '/settings',
  notifications: '/settings/notifications',
  login: '/login',
  signup: '/signup',
  projectInvite: '/project-invite/:token',
  invite: '/invite/:token',
  guestTaskShare: '/guest/tasks/:token',
  /** Short SMS-friendly alias for guest task shares */
  guestTaskShareShort: '/t/:token',
  guestPunchListReview: '/guest/punch-list/:token',
  smsConsent: '/sms-consent/:token',
  /** Public sample opt-in page for SMS program registration / review */
  smsOptIn: '/sms-opt-in',
}

export const PRIMARY_NAV_ITEMS = [
  { label: 'Dashboard', to: ROUTE_PATHS.home },
  { label: 'Projects', to: ROUTE_PATHS.projects },
  { label: 'Calendar', to: ROUTE_PATHS.calendar },
  { label: 'Trade Partners', to: ROUTE_PATHS.tradePartners },
  { label: 'Organization', to: ROUTE_PATHS.organization },
  { label: 'Settings', to: ROUTE_PATHS.settings },
]

export const VIEW_ROUTE_PATHS = {
  Dashboard: ROUTE_PATHS.home,
  Projects: ROUTE_PATHS.projects,
  Calendar: ROUTE_PATHS.calendar,
  Team: ROUTE_PATHS.tradePartners,
  Messages: ROUTE_PATHS.tradePartners,
  Contacts: ROUTE_PATHS.tradePartners,
  Organization: ROUTE_PATHS.organization,
  Settings: ROUTE_PATHS.settings,
}
