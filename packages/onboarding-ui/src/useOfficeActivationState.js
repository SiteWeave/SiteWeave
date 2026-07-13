import { useEffect, useMemo, useState } from 'react';
import { computeActivationState } from './activationChecklist';

/**
 * Loads real activation metrics for the office checklist.
 */
export function useOfficeActivationState(supabase, organizationId, projects = [], userId) {
  const [metrics, setMetrics] = useState({
    projectCount: projects?.length || 0,
    hasPhasesOrGantt: false,
    teamInviteSent: false,
    reportCount: 0,
  });

  const projectIds = useMemo(
    () => (projects || []).map((p) => p.id).filter(Boolean),
    [projects],
  );

  useEffect(() => {
    setMetrics((prev) => ({ ...prev, projectCount: projects?.length || 0 }));
  }, [projects?.length]);

  useEffect(() => {
    if (!supabase || !organizationId) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const [phasesRes, reportsRes, invitesRes, membersRes] = await Promise.all([
          projectIds.length
            ? supabase
                .from('project_phases')
                .select('id', { count: 'exact', head: true })
                .in('project_id', projectIds)
            : Promise.resolve({ count: 0 }),
          supabase
            .from('progress_report_history')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId),
          supabase
            .from('invitations')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId),
          supabase
            .from('contacts')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId),
        ]);

        if (cancelled) return;

        const inviteFlag =
          userId && localStorage.getItem(`siteweave_onboarding_team_invite_${userId}`) === '1';

        setMetrics({
          projectCount: projects?.length || 0,
          hasPhasesOrGantt: (phasesRes.count ?? 0) > 0,
          teamInviteSent: (invitesRes.count ?? 0) > 0 || (membersRes.count ?? 0) > 1 || inviteFlag,
          reportCount: reportsRes.count ?? 0,
        });
      } catch (error) {
        console.warn('useOfficeActivationState:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, organizationId, projectIds.join(','), userId, projects?.length]);

  return useMemo(
    () =>
      computeActivationState({
        projectCount: metrics.projectCount,
        hasPhasesOrGantt: metrics.hasPhasesOrGantt,
        teamInviteSent: metrics.teamInviteSent,
        reportCount: metrics.reportCount,
      }),
    [metrics],
  );
}

export function markTeamInviteSent(userId) {
  if (!userId) return;
  try {
    localStorage.setItem(`siteweave_onboarding_team_invite_${userId}`, '1');
  } catch {
    /* ignore */
  }
}
