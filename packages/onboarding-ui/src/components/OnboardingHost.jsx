import React, { useEffect } from 'react';
import { useOnboarding } from '../useOnboarding';
import { onboardingSteps } from '../onboardingSteps';
import OnboardingTour from './OnboardingTour';
import OnboardingWelcome from './OnboardingWelcome';
import OnboardingProgress from './OnboardingProgress';

/**
 * Shell-agnostic onboarding shell: welcome modal + guided tour + progress pill.
 */
export default function OnboardingHost({
  user,
  userId,
  primaryColor = '#3B82F6',
  onNavigateStep,
  onComplete,
  pendingTourStart = false,
  replaySignal = 0,
  welcomeCopy,
  tooltipLabels,
}) {
  const onboarding = useOnboarding({
    userId,
    steps: onboardingSteps,
    onNavigateStep,
    onComplete,
    pendingTourStart,
  });

  useEffect(() => {
    if (replaySignal > 0) {
      onboarding.replayOnboarding();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replaySignal]);

  if (!userId) return null;

  return (
    <>
      {onboarding.showWelcome ? (
        <OnboardingWelcome
          user={user}
          primaryColor={primaryColor}
          copy={welcomeCopy}
          onStartTour={onboarding.startOnboarding}
          onSkip={onboarding.skipWelcome}
        />
      ) : null}

      {onboarding.isOnboardingActive ? (
        <>
          <OnboardingProgress
            currentStep={onboarding.currentStep}
            totalSteps={onboarding.totalSteps}
            currentView={onboarding.currentView}
            primaryColor={primaryColor}
          />
          <OnboardingTour
            isActive={onboarding.isOnboardingActive}
            currentStep={onboarding.currentStep}
            totalSteps={onboarding.totalSteps}
            steps={onboarding.steps}
            isNavigating={onboarding.isNavigating}
            primaryColor={primaryColor}
            onNext={onboarding.completeStep}
            onPrevious={onboarding.goToPreviousStep}
            onSkip={onboarding.skipOnboarding}
          />
        </>
      ) : null}
    </>
  );
}
