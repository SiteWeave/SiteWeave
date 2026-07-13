import { useCallback, useEffect, useState } from 'react';
import { onboardingSteps } from './onboardingSteps';
import { getOnboardingPreferences, saveOnboardingPreferences } from './storage';

const NAV_WAIT_MS = 350;

export function useOnboarding({
  userId,
  steps = onboardingSteps,
  onNavigateStep,
  onComplete,
  autoStart = false,
  pendingTourStart = false,
}) {
  const [userPreferences, setUserPreferences] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnboardingActive, setIsOnboardingActive] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentView, setCurrentView] = useState(steps[0]?.view || 'Dashboard');
  const [isNavigating, setIsNavigating] = useState(false);

  const persist = useCallback(
    (patch) => {
      if (!userId) return;
      const next = { ...(userPreferences || {}), user_id: userId, ...patch };
      saveOnboardingPreferences(userId, next);
      setUserPreferences(next);
    },
    [userId, userPreferences],
  );

  const navigateToStep = useCallback(
    async (stepIndex) => {
      const stepInfo = steps[stepIndex];
      if (!stepInfo || !onNavigateStep) return;
      setIsNavigating(true);
      try {
        await onNavigateStep(stepInfo, stepIndex);
        setCurrentView(stepInfo.view);
        await new Promise((resolve) => setTimeout(resolve, NAV_WAIT_MS));
      } finally {
        setIsNavigating(false);
      }
    },
    [onNavigateStep, steps],
  );

  const initializeOnboarding = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      let preferences = getOnboardingPreferences(userId);
      if (!preferences) {
        preferences = {
          user_id: userId,
          onboarding_completed: false,
          onboarding_step: 0,
          welcome_dismissed: false,
          created_at: new Date().toISOString(),
        };
        saveOnboardingPreferences(userId, preferences);
      }

      setUserPreferences(preferences);

      if (pendingTourStart && !preferences.onboarding_completed) {
        setShowWelcome(true);
      } else if (autoStart && !preferences.onboarding_completed && preferences.welcome_dismissed) {
        setIsOnboardingActive(true);
        setCurrentStep(preferences.onboarding_step || 0);
        const stepInfo = steps[preferences.onboarding_step || 0];
        if (stepInfo) {
          setCurrentView(stepInfo.view);
          await navigateToStep(preferences.onboarding_step || 0);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId, autoStart, pendingTourStart, steps, navigateToStep]);

  useEffect(() => {
    initializeOnboarding();
  }, [initializeOnboarding]);

  useEffect(() => {
    if (!pendingTourStart || !userId) return;
    const preferences = getOnboardingPreferences(userId);
    if (preferences?.onboarding_completed) return;
    setShowWelcome(true);
    persist({ welcome_dismissed: false });
  }, [pendingTourStart, userId, persist]);

  const startOnboarding = useCallback(async () => {
    setShowWelcome(false);
    setIsOnboardingActive(true);
    setCurrentStep(0);
    persist({ welcome_dismissed: true, onboarding_step: 0 });
    await navigateToStep(0);
  }, [navigateToStep, persist]);

  const replayOnboarding = useCallback(async () => {
    setShowWelcome(false);
    setIsOnboardingActive(true);
    setCurrentStep(0);
    persist({ onboarding_completed: false, onboarding_step: 0, welcome_dismissed: true });
    await navigateToStep(0);
  }, [navigateToStep, persist]);

  const skipWelcome = useCallback(() => {
    setShowWelcome(false);
    persist({ welcome_dismissed: true, onboarding_completed: true });
  }, [persist]);

  const completeStep = useCallback(async () => {
    const nextStep = currentStep + 1;
    if (nextStep >= steps.length) {
      setIsOnboardingActive(false);
      persist({ onboarding_completed: true, onboarding_step: steps.length - 1 });
      onComplete?.();
      return true;
    }

    await navigateToStep(nextStep);
    setCurrentStep(nextStep);
    persist({ onboarding_step: nextStep });
    return false;
  }, [currentStep, steps.length, navigateToStep, persist, onComplete]);

  const goToPreviousStep = useCallback(async () => {
    if (currentStep <= 0) return;
    const prevStep = currentStep - 1;
    await navigateToStep(prevStep);
    setCurrentStep(prevStep);
    persist({ onboarding_step: prevStep });
  }, [currentStep, navigateToStep, persist]);

  const skipOnboarding = useCallback(() => {
    setIsOnboardingActive(false);
    setShowWelcome(false);
    persist({ onboarding_completed: true, onboarding_step: steps.length - 1, welcome_dismissed: true });
  }, [persist, steps.length]);

  const getCurrentStepInfo = useCallback(() => steps[currentStep] || null, [steps, currentStep]);

  return {
    userPreferences,
    isLoading,
    isOnboardingActive,
    showWelcome,
    currentStep,
    currentView,
    isNavigating,
    totalSteps: steps.length,
    steps,
    getCurrentStepInfo,
    shouldShowOnboarding: () => isOnboardingActive,
    initializeOnboarding,
    startOnboarding,
    replayOnboarding,
    skipWelcome,
    completeStep,
    goToPreviousStep,
    skipOnboarding,
    navigateToStep,
  };
}
