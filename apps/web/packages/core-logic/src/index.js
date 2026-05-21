// Export Supabase client
export * from './supabase/client.js';

// Progress rollup (duration-weighted; prefers stored phase progress)
export {
  computeWeightedProjectProgressPercent,
  computeProjectScheduleTimeline,
  groupPhasesByProjectId,
  inferScheduleBoundsFromTasks,
} from './utils/projectProgressRollup.js';

export {
  addBusinessDays,
  inclusiveBusinessDaysLost,
  inclusiveBusinessDaysInRange,
  buildFederalHolidayMap,
  businessDaysBetween,
} from './utils/usBusinessCalendar.js';

export { normalizeAssigneePhone } from './utils/assigneePhone.js';

export { upsertById, removeById, getRealtimeRow } from './utils/realtimeList.js';

export {
  REPORT_REASONS,
  REASON_LABELS,
  REPORT_STATUS_COLORS,
  isModerationAdmin,
} from './constants/moderation.js';

// Export services
export * from './services/tasksService.js';
export * from './services/projectsService.js';
export * from './services/workspaceService.js';
export * from './constants/workspace.js';
export * from './services/messagesService.js';
export * from './services/streamService.js';
export * from './services/taskCommentsService.js';
export * from './services/projectCommunicationNotifyService.js';
export * from './services/calendarService.js';
export * from './services/issuesService.js';
export * from './services/issueCommentsService.js';
export * from './services/activityService.js';
export * from './services/fileService.js';
export * from './services/taskPhotosService.js';
export * from './services/typingService.js';
export * from './services/contactsService.js';
export * from './services/moderationService.js';
export * from './services/progressReportService.js';
export * from './services/brandingService.js';
export * from './services/weatherImpactsService.js';

