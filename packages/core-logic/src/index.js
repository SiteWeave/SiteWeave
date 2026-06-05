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

export {
  normalizeContactEmail,
  normalizeContactPhoneDigits,
  contactPhonesMatch,
} from './utils/contactIdentity.js';

export { sortProjectsByRecency } from './utils/projectListSort.js';

export { upsertById, removeById, getRealtimeRow } from './utils/realtimeList.js';

export {
  CACHE_TTL,
  cacheKey,
  get as getMemoryCache,
  set as setMemoryCache,
  isFresh as isMemoryCacheFresh,
  invalidate as invalidateMemoryCache,
  clear as clearMemoryCache,
} from './cache/memoryCache.js';

export { runOptimistic, createOptimisticUpdate } from './utils/optimistic.js';

export { loadWithFallback } from './utils/loadWithFallback.js';

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
export {
  ORG_ADMIN_PERMISSIONS,
  getRolePermissionsForDisplay,
} from './constants/orgAdminPermissions.js';
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
export * from './services/feedbackService.js';
export * from './services/progressReportService.js';
export * from './services/brandingService.js';
export * from './services/weatherImpactsService.js';
export * from './services/profilePhotosService.js';
export * from './services/workStatusService.js';

