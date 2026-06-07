import { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  canExportProfessionalDocs,
  canSendManualPings,
  canUseCustomRoles,
  canUseProgressReports,
  canUseTaskReminders,
  getTrialDaysRemaining,
  hasFullTierAccess,
  isOnPersonalTrial,
  isPersonalWorkspace,
} from '@siteweave/core-logic';

export function useWorkspaceTier() {
  const { state } = useAppContext();
  const org = state.currentOrganization;

  return useMemo(() => {
    const isPersonal = isPersonalWorkspace(org);
    const isOnTrial = isOnPersonalTrial(org);
    const hasFullAccess = hasFullTierAccess(org);
    const trialEndsAt = org?.trial_ends_at ?? null;
    const trialDaysRemaining = getTrialDaysRemaining(org);

    return {
      org,
      isPersonal,
      isOnTrial,
      trialEndsAt,
      trialDaysRemaining,
      showTrialCountdown: isOnTrial,
      hasFullAccess,
      canExport: canExportProfessionalDocs(org),
      canCustomRoles: canUseCustomRoles(org),
      canRemind: canUseTaskReminders(org),
      canPing: canSendManualPings(org),
      canProgressReports: canUseProgressReports(org),
    };
  }, [org]);
}
