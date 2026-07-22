import { ACCOUNT_INTENTS } from '../constants/workspace.js';

export const REVIEW_PROMPT_ELIGIBILITY_DAYS = 7;

export const REVIEW_PROMPT_ACTIONS = Object.freeze({
  DISMISSED: 'dismissed',
  REQUESTED_REVIEW: 'requested_review',
});

/**
 * Resolve the clock start for the 7-day review prompt.
 * Prefer explicit review_eligible_at; fall back to profile created_at for legacy rows.
 */
export function resolveReviewEligibleAt(profile) {
  return profile?.review_eligible_at || profile?.created_at || null;
}

export function hasReviewPromptBeenShown(profile) {
  return Boolean(profile?.review_prompt_shown_at);
}

/**
 * Audience gate: org members only (business, invited, or personal trial owners).
 * Guest-only / project-collaborator-only users are excluded.
 */
export function isReviewPromptAudienceEligible({
  accountIntent,
  hasOrganization = false,
  isProjectCollaboratorOnly = false,
} = {}) {
  if (accountIntent === ACCOUNT_INTENTS.GUEST_ONLY) return false;
  if (isProjectCollaboratorOnly) return false;
  if (!hasOrganization) return false;
  return true;
}

/**
 * True when now is at least `days` after the eligibility clock start.
 */
export function isReviewPromptDue({
  reviewEligibleAt,
  now = new Date(),
  days = REVIEW_PROMPT_ELIGIBILITY_DAYS,
} = {}) {
  if (!reviewEligibleAt) return false;
  const startMs = new Date(reviewEligibleAt).getTime();
  if (!Number.isFinite(startMs)) return false;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return false;
  const elapsedMs = nowMs - startMs;
  return elapsedMs >= days * 24 * 60 * 60 * 1000;
}

/**
 * Full eligibility for showing the soft review prompt after a successful product moment.
 */
export function shouldShowReviewPrompt({
  profile,
  hasOrganization = false,
  isProjectCollaboratorOnly = false,
  onboardingComplete = false,
  now = new Date(),
  days = REVIEW_PROMPT_ELIGIBILITY_DAYS,
} = {}) {
  if (!onboardingComplete) return false;
  if (hasReviewPromptBeenShown(profile)) return false;
  if (
    !isReviewPromptAudienceEligible({
      accountIntent: profile?.account_intent,
      hasOrganization,
      isProjectCollaboratorOnly,
    })
  ) {
    return false;
  }
  return isReviewPromptDue({
    reviewEligibleAt: resolveReviewEligibleAt(profile),
    now,
    days,
  });
}
