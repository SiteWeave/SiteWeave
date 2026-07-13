import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  canExportProfessionalDocs,
  canUseProgressReports,
  hasFullTierAccess,
  getTrialDaysRemaining,
  isOnPersonalTrial,
  isPersonalWorkspace,
} from '@siteweave/core-logic';

export function useWorkspaceTier() {
  const { activeOrganization } = useAuth();
  const org = activeOrganization;

  return useMemo(() => {
    const isPersonal = isPersonalWorkspace(org);
    const isOnTrial = isOnPersonalTrial(org);
    const hasFullAccess = hasFullTierAccess(org);
    return {
      org,
      isPersonal,
      isOnTrial,
      trialDaysRemaining: getTrialDaysRemaining(org),
      hasFullAccess,
      canExport: canExportProfessionalDocs(org),
      canProgressReports: canUseProgressReports(org),
    };
  }, [org]);
}
