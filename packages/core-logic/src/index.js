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
  calculatePhaseProgressFromTasks,
  buildPhasesWithDerivedProgress,
  groupTasksByPhaseId,
} from './utils/projectPhasesUtils.js';

export {
  addBusinessDays,
  inclusiveBusinessDaysLost,
  inclusiveBusinessDaysInRange,
  buildFederalHolidayMap,
  businessDaysBetween,
} from './utils/usBusinessCalendar.js';

export {
  parseLocalDateOnly,
  localDateOnlyIso,
  addDaysToDateOnly,
  formatLocalDateOnly,
  formatLocalDateRange,
  daysBetweenDateOnly,
  isDateOnlyString,
  formatDateForDisplay,
} from './utils/dateOnly.js';

export { normalizeAssigneePhone } from './utils/assigneePhone.js';
export { isTradePartnerContact } from './utils/contactType.js';

export {
  SITEWEAVE_PHYSICAL_ADDRESS,
  SITEWEAVE_LOGO_URL,
  SITEWEAVE_SITE_URL,
  SITEWEAVE_CONTACT_URL,
  escapeHtml as escapeTransactionalHtml,
  buildComplianceFooterHtml,
  buildComplianceFooterText,
  buildPrimaryCtaHtml,
  buildLinkFallbackHtml,
  buildTransactionalShell,
  buildTaskAssignmentEmail,
} from './email/transactionalEmailLayout.js';

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

export { resolveStorageUpload } from './utils/uploadPayload.js';

export { canManageTaskPhotos } from './utils/taskPhotoPermissions.js';

export {
  isPersistedContactId,
  profileIdFromContactRef,
  ensureContactIdForProjectAssignment,
} from './utils/ensureContactForProject.js';

export {
  REPORT_REASONS,
  REASON_LABELS,
  REPORT_STATUS_COLORS,
  canAccessContentReports,
  isModerationAdmin,
} from './constants/moderation.js';

// Export services
export * from './services/tasksService.js';
export * from './services/projectsService.js';
export * from './services/projectTrashService.js';
export * from './services/workspaceService.js';
export * from './constants/workspace.js';
export {
  ORG_ADMIN_PERMISSIONS,
  getRolePermissionsForDisplay,
} from './constants/orgAdminPermissions.js';

export {
  PROJECT_CREW_ROLES,
  mapOrgRoleToDefaultProjectCrewRole,
  defaultProjectCrewRoleForContact,
  projectCrewRoleShortLabel,
} from './utils/projectCrewRole.js';

export { TRADE_OPTIONS, isKnownTradeOption } from './constants/tradeOptions.js';

export {
  SMS_NOTIFICATIONS_ENABLED,
  isSmsNotificationsEnabled,
} from './constants/smsNotifications.js';
export * from './services/messagesService.js';
export * from './services/streamService.js';
export * from './services/taskCommentsService.js';
export * from './services/projectCommunicationNotifyService.js';
export * from './services/calendarService.js';
export * from './services/calendarInviteService.js';
export * from './services/issuesService.js';
export * from './services/issueCommentsService.js';
export * from './services/activityService.js';
export * from './services/activityHistoryService.js';
export * from './services/taskDependenciesService.js';
export * from './services/photoRollService.js';
export * from './services/guestTaskShareService.js';
export * from './services/fileService.js';
export * from './services/taskPhotosService.js';
export * from './services/typingService.js';
export * from './services/contactsService.js';
export * from './services/moderationService.js';
export * from './services/feedbackService.js';
export * from './services/progressReportService.js';
export * from './utils/projectSmartNotifications.js';
export * from './services/brandingService.js';
export * from './services/weatherImpactsService.js';
export * from './services/profilePhotosService.js';
export * from './services/workStatusService.js';

export {
  todayIso,
  wasCompletedToday,
  weatherImpactIsToday,
  buildSiteDaySections,
  buildSiteDayBodyFromSections,
  buildDraftBody,
  parseDailyLogPayload,
  isPassiveSiteDayReady,
  fetchDailyLogsForReportPeriod,
} from './utils/siteDayLog.js';

