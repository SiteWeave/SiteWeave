export { onboardingSteps, getStepsByView, getStepById, getTotalSteps } from './onboardingSteps';
export {
  ACTIVATION_ITEMS,
  computeActivationState,
  getActivationProgress,
  isActivationComplete,
} from './activationChecklist';
export {
  getOnboardingPreferences,
  saveOnboardingPreferences,
  getChecklistDismissed,
  setChecklistDismissed,
} from './storage';
export {
  shouldShowSetupWizard,
  isEligibleForActivationChecklist,
} from './shouldShowSetupWizard';
export { STARTER_TEMPLATES, seedStarterTemplatesIfNeeded, loadSampleProjectIfRequested } from './starterTemplates';
export { useOnboarding } from './useOnboarding';
export { useOfficeActivationState, markTeamInviteSent } from './useOfficeActivationState';
export { useBrandingPrimaryColor } from './useBrandingPrimaryColor';

export { default as OnboardingTour } from './components/OnboardingTour';
export { default as OnboardingTooltip } from './components/OnboardingTooltip';
export { default as OnboardingSpotlight } from './components/OnboardingSpotlight';
export { default as OnboardingWelcome } from './components/OnboardingWelcome';
export { default as OnboardingProgress } from './components/OnboardingProgress';
export { default as ActivationChecklist } from './components/ActivationChecklist';
export { default as OnboardingHost } from './components/OnboardingHost';
