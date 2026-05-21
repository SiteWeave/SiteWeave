import { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  canExportProfessionalDocs,
  canUseCustomRoles,
  isPersonalWorkspace,
} from '@siteweave/core-logic';

export function useWorkspaceTier() {
  const { state } = useAppContext();
  const org = state.currentOrganization;

  return useMemo(
    () => ({
      org,
      isPersonal: isPersonalWorkspace(org),
      canExport: canExportProfessionalDocs(org),
      canCustomRoles: canUseCustomRoles(org),
    }),
    [org],
  );
}
