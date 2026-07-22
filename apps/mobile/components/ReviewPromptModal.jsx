import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  REVIEW_PROMPT_ACTIONS,
  shouldShowReviewPrompt,
} from '@siteweave/core-logic';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import ModalScrim from './ui/ModalScrim';
import { useAuth } from '../context/AuthContext';
import { useAppUpdate } from '../context/AppUpdateContext';
import { hasCompletedOnboarding, getPendingInviteOnboarding } from '../utils/onboarding';
import { subscribeReviewPromptOpportunity } from '../utils/reviewPromptEvents';
import { requestReviewOrOpenStore } from '../utils/storeReview';
import { getNativeApplicationVersion } from '../utils/appVersion';
import { colors, spacing, touch } from '../theme';

const PRESENT_DELAY_MS = 1200;

export default function ReviewPromptModal() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const {
    user,
    loading,
    supabase,
    activeOrganization,
    isProjectCollaborator,
  } = useAuth();
  const { storeUrl, storeUpdateRequired } = useAppUpdate();

  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const evaluatingRef = useRef(false);
  const shownThisSessionRef = useRef(false);
  const presentTimerRef = useRef(null);

  const clearPresentTimer = useCallback(() => {
    if (presentTimerRef.current) {
      clearTimeout(presentTimerRef.current);
      presentTimerRef.current = null;
    }
  }, []);

  const persistPromptResult = useCallback(
    async (action) => {
      if (!user?.id || !supabase) return;
      const payload = {
        review_prompt_shown_at: new Date().toISOString(),
        review_prompt_action: action,
        review_prompt_app_version: getNativeApplicationVersion(),
      };
      const { error } = await supabase.from('profiles').update(payload).eq('id', user.id);
      if (error) {
        console.warn('Failed to persist review prompt result:', error.message);
      }
    },
    [supabase, user?.id],
  );

  const evaluateAndMaybeShow = useCallback(async () => {
    if (evaluatingRef.current || shownThisSessionRef.current || visible) return;
    if (loading || !user?.id || !supabase) return;
    if (storeUpdateRequired) return;

    evaluatingRef.current = true;
    try {
      const pending = await getPendingInviteOnboarding();
      const onboardingComplete = await hasCompletedOnboarding({
        userId: user.id,
        skipWeather: pending.skipWeather,
      });
      if (!onboardingComplete) return;

      const hasOrganization = Boolean(activeOrganization?.id);
      const isProjectCollaboratorOnly = Boolean(isProjectCollaborator) && !hasOrganization;
      if (!hasOrganization) return;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select(
          'account_intent, created_at, review_eligible_at, review_prompt_shown_at, review_prompt_action',
        )
        .eq('id', user.id)
        .maybeSingle();

      if (error || !profile) {
        if (error) console.warn('Review prompt profile load failed:', error.message);
        return;
      }

      const eligible = shouldShowReviewPrompt({
        profile,
        hasOrganization,
        isProjectCollaboratorOnly,
        onboardingComplete: true,
      });
      if (!eligible) return;

      shownThisSessionRef.current = true;
      clearPresentTimer();
      presentTimerRef.current = setTimeout(() => {
        setVisible(true);
      }, PRESENT_DELAY_MS);
    } finally {
      evaluatingRef.current = false;
    }
  }, [
    activeOrganization?.id,
    clearPresentTimer,
    isProjectCollaborator,
    loading,
    storeUpdateRequired,
    supabase,
    user?.id,
    visible,
  ]);

  useEffect(() => {
    const unsubscribe = subscribeReviewPromptOpportunity(() => {
      evaluateAndMaybeShow();
    });
    return unsubscribe;
  }, [evaluateAndMaybeShow]);

  useEffect(() => () => clearPresentTimer(), [clearPresentTimer]);

  useEffect(() => {
    shownThisSessionRef.current = false;
    setVisible(false);
  }, [user?.id]);

  const handleDismiss = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      setVisible(false);
      await persistPromptResult(REVIEW_PROMPT_ACTIONS.DISMISSED);
    } finally {
      setBusy(false);
    }
  }, [busy, persistPromptResult]);

  const handleLeaveReview = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      setVisible(false);
      await persistPromptResult(REVIEW_PROMPT_ACTIONS.REQUESTED_REVIEW);
      await requestReviewOrOpenStore(storeUrl);
    } finally {
      setBusy(false);
    }
  }, [busy, persistPromptResult, storeUrl]);

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <View style={styles.root}>
        <ModalScrim opacity={0.55} onPress={busy ? undefined : handleDismiss} />
        <View style={[styles.card, { marginBottom: insets.bottom + spacing.xl }]}>
          <Text variant="screenTitle" style={styles.title}>
            {t('mobile.review_prompt_title')}
          </Text>
          <Text variant="body" style={styles.body}>
            {t('mobile.review_prompt_body')}
          </Text>
          <PressableWithFade
            style={styles.primaryButton}
            onPress={busy ? undefined : handleLeaveReview}
            disabled={busy}
            testID="review-prompt-leave-review"
          >
            <Text variant="bodyMedium" style={styles.primaryButtonText}>
              {t('mobile.review_prompt_leave_review')}
            </Text>
          </PressableWithFade>
          <PressableWithFade
            style={styles.secondaryButton}
            onPress={busy ? undefined : handleDismiss}
            disabled={busy}
            testID="review-prompt-not-now"
          >
            <Text variant="bodyMedium" style={styles.secondaryButtonText}>
              {t('mobile.review_prompt_not_now')}
            </Text>
          </PressableWithFade>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 1,
  },
  title: {
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  body: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  primaryButton: {
    minHeight: touch.minSize,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: touch.minSize,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
