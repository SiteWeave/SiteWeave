import { useCallback } from 'react';
import { OnboardingHost, useBrandingPrimaryColor } from '@siteweave/onboarding-ui';
import { getOrganizationBranding } from '@siteweave/core-logic';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';

const loadBrandingColor = (organizationId) =>
  getOrganizationBranding(supabaseClient, organizationId).then((b) => b?.primary_color);

export default function DesktopOnboardingHost({ pendingTourStart = false, replaySignal = 0 }) {
  const { state, dispatch } = useAppContext();
  const { addToast } = useToast();

  const primaryColor = useBrandingPrimaryColor(loadBrandingColor, state.currentOrganization?.id);

  const onNavigateStep = useCallback(
    async (stepInfo) => {
      if (!stepInfo) return;

      dispatch({ type: 'SET_VIEW', payload: stepInfo.view });

      if (stepInfo.view === 'Projects') {
        const projectId = state.selectedProjectId || state.projects?.[0]?.id;
        if (projectId) {
          dispatch({ type: 'SET_PROJECT', payload: projectId });
        }
      }
    },
    [dispatch, state.projects, state.selectedProjectId],
  );

  const onComplete = useCallback(() => {
    addToast("You're all set — explore progress reports when you're ready.", 'success');
  }, [addToast]);

  if (!state.user?.id) return null;

  return (
    <OnboardingHost
      user={state.user}
      userId={state.user.id}
      primaryColor={primaryColor}
      onNavigateStep={onNavigateStep}
      onComplete={onComplete}
      pendingTourStart={pendingTourStart}
      replaySignal={replaySignal}
    />
  );
}
