import assert from 'node:assert/strict';
import {
  REVIEW_PROMPT_ELIGIBILITY_DAYS,
  REVIEW_PROMPT_ACTIONS,
  resolveReviewEligibleAt,
  hasReviewPromptBeenShown,
  isReviewPromptAudienceEligible,
  isReviewPromptDue,
  shouldShowReviewPrompt,
} from './reviewPrompt.js';

assert.equal(REVIEW_PROMPT_ELIGIBILITY_DAYS, 7);
assert.equal(REVIEW_PROMPT_ACTIONS.DISMISSED, 'dismissed');
assert.equal(REVIEW_PROMPT_ACTIONS.REQUESTED_REVIEW, 'requested_review');

assert.equal(resolveReviewEligibleAt({ review_eligible_at: '2026-01-10T00:00:00.000Z' }), '2026-01-10T00:00:00.000Z');
assert.equal(
  resolveReviewEligibleAt({ created_at: '2026-01-01T00:00:00.000Z' }),
  '2026-01-01T00:00:00.000Z',
);
assert.equal(
  resolveReviewEligibleAt({
    review_eligible_at: '2026-01-10T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
  }),
  '2026-01-10T00:00:00.000Z',
);
assert.equal(resolveReviewEligibleAt(null), null);

assert.equal(hasReviewPromptBeenShown({ review_prompt_shown_at: '2026-01-20T00:00:00.000Z' }), true);
assert.equal(hasReviewPromptBeenShown({}), false);

assert.equal(
  isReviewPromptAudienceEligible({
    accountIntent: 'workspace_owner',
    hasOrganization: true,
    isProjectCollaboratorOnly: false,
  }),
  true,
);
assert.equal(
  isReviewPromptAudienceEligible({
    accountIntent: 'guest_only',
    hasOrganization: false,
    isProjectCollaboratorOnly: true,
  }),
  false,
);
assert.equal(
  isReviewPromptAudienceEligible({
    accountIntent: 'workspace_owner',
    hasOrganization: false,
    isProjectCollaboratorOnly: true,
  }),
  false,
);
assert.equal(
  isReviewPromptAudienceEligible({
    accountIntent: 'workspace_owner',
    hasOrganization: false,
    isProjectCollaboratorOnly: false,
  }),
  false,
);

const eligibleAt = '2026-07-01T12:00:00.000Z';
assert.equal(
  isReviewPromptDue({
    reviewEligibleAt: eligibleAt,
    now: new Date('2026-07-08T11:59:59.000Z'),
  }),
  false,
);
assert.equal(
  isReviewPromptDue({
    reviewEligibleAt: eligibleAt,
    now: new Date('2026-07-08T12:00:00.000Z'),
  }),
  true,
);
assert.equal(isReviewPromptDue({ reviewEligibleAt: null, now: new Date() }), false);

const baseProfile = {
  account_intent: 'workspace_owner',
  review_eligible_at: '2026-07-01T00:00:00.000Z',
  created_at: '2026-06-20T00:00:00.000Z',
};

assert.equal(
  shouldShowReviewPrompt({
    profile: baseProfile,
    hasOrganization: true,
    isProjectCollaboratorOnly: false,
    onboardingComplete: true,
    now: new Date('2026-07-08T00:00:00.000Z'),
  }),
  true,
);

assert.equal(
  shouldShowReviewPrompt({
    profile: baseProfile,
    hasOrganization: true,
    isProjectCollaboratorOnly: false,
    onboardingComplete: false,
    now: new Date('2026-07-08T00:00:00.000Z'),
  }),
  false,
);

assert.equal(
  shouldShowReviewPrompt({
    profile: { ...baseProfile, review_prompt_shown_at: '2026-07-09T00:00:00.000Z' },
    hasOrganization: true,
    isProjectCollaboratorOnly: false,
    onboardingComplete: true,
    now: new Date('2026-07-10T00:00:00.000Z'),
  }),
  false,
);

assert.equal(
  shouldShowReviewPrompt({
    profile: { ...baseProfile, account_intent: 'guest_only' },
    hasOrganization: false,
    isProjectCollaboratorOnly: true,
    onboardingComplete: true,
    now: new Date('2026-07-10T00:00:00.000Z'),
  }),
  false,
);

assert.equal(
  shouldShowReviewPrompt({
    profile: { account_intent: 'workspace_owner', created_at: '2026-07-01T00:00:00.000Z' },
    hasOrganization: true,
    isProjectCollaboratorOnly: false,
    onboardingComplete: true,
    now: new Date('2026-07-08T00:00:00.000Z'),
  }),
  true,
);

assert.equal(
  shouldShowReviewPrompt({
    profile: baseProfile,
    hasOrganization: true,
    isProjectCollaboratorOnly: false,
    onboardingComplete: true,
    now: new Date('2026-07-07T23:59:59.000Z'),
  }),
  false,
);

console.log('reviewPrompt.test.mjs passed');
