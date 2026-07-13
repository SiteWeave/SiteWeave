import React from 'react';
import OnboardingTooltip from './OnboardingTooltip';
import OnboardingSpotlight from './OnboardingSpotlight';

export default function OnboardingTour({
  isActive,
  currentStep,
  totalSteps,
  steps,
  onNext,
  onPrevious,
  onSkip,
  isNavigating = false,
  primaryColor = '#3B82F6',
}) {
  if (!isActive || isNavigating) return null;

  const currentStepInfo = steps[currentStep];
  if (!currentStepInfo) return null;

  return (
    <OnboardingSpotlight
      targetSelector={currentStepInfo.selector}
      isVisible={isActive}
      primaryColor={primaryColor}
      onOverlayClick={() => {}}
    >
      <OnboardingTooltip
        targetSelector={currentStepInfo.selector}
        title={currentStepInfo.title}
        description={currentStepInfo.description}
        step={currentStep + 1}
        totalSteps={totalSteps}
        onNext={onNext}
        onPrevious={onPrevious}
        onSkip={onSkip}
        isVisible={isActive}
        position={currentStepInfo.position}
        action={currentStepInfo.action}
        primaryColor={primaryColor}
      />
    </OnboardingSpotlight>
  );
}
