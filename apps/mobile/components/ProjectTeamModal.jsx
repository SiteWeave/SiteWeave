import { View, StyleSheet, Linking, ActivityIndicator } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { fetchProjectContacts } from '@siteweave/core-logic';
import { Ionicons } from '@expo/vector-icons';
import PressableWithFade from './PressableWithFade';
import Avatar from './ui/Avatar';
import BottomSheet, { useSheetInsets } from './ui/BottomSheet';
import ProjectInviteSheet from './ProjectInviteSheet';
import { Text } from './ui/Text';
import { colors, spacing, touch } from '../theme';
import { sheetListEndPadding } from '../utils/layoutInsets';
import { useCollapsibleList, ShowMoreToggle } from './ui/CollapsibleList';

export default function ProjectTeamModal({
  visible,
  projectId,
  project = null,
  canInvite = false,
  openInviteOnMount = false,
  onClose,
}) {
  const { t } = useTranslation();
  const { supabase, user } = useAuth();
  const sheetInsets = useSheetInsets();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [teamSheetOpen, setTeamSheetOpen] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteDismissFast, setInviteDismissFast] = useState(false);
  const pendingInviteRef = useRef(false);
  const returnToTeamRef = useRef(false);
  const openedInviteDirectRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      setTeamSheetOpen(false);
      setShowInvite(false);
      setInviteDismissFast(false);
      pendingInviteRef.current = false;
      returnToTeamRef.current = false;
      openedInviteDirectRef.current = false;
      return;
    }

    if (openInviteOnMount && canInvite) {
      openedInviteDirectRef.current = true;
      returnToTeamRef.current = false;
      setTeamSheetOpen(false);
      setShowInvite(true);
      return;
    }

    openedInviteDirectRef.current = false;
    setTeamSheetOpen(true);
    setShowInvite(false);
    pendingInviteRef.current = false;
    returnToTeamRef.current = false;
  }, [visible, openInviteOnMount, canInvite]);

  useEffect(() => {
    if (visible && projectId) {
      loadContacts();
    }
  }, [visible, projectId]);

  const loadContacts = async () => {
    if (!projectId || !supabase) return;

    try {
      setLoading(true);
      const data = await fetchProjectContacts(supabase, projectId).catch((err) => {
        console.error('Error fetching project contacts:', err);
        return [];
      });
      setContacts(data || []);
    } catch (error) {
      console.error('Error loading contacts:', error);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  };

  const { displayedItems, expanded, setExpanded, hasMore, hiddenCount } = useCollapsibleList(contacts, []);

  const handleCall = (phone) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  };

  const handleMessage = (phone) => {
    if (phone) {
      Linking.openURL(`sms:${phone}`);
    }
  };

  const renderContact = (item) => (
    <View key={String(item.id)} style={styles.contactItem}>
      <Avatar name={item.name} avatarUrl={item.avatar_url} size="md" />
      <View style={styles.contactInfo}>
        <Text variant="bodyMedium" style={styles.contactName}>
          {item.name}
        </Text>
        {item.role ? (
          <Text variant="caption" style={styles.contactRole}>
            {item.role}
          </Text>
        ) : null}
        {item.company ? (
          <Text variant="caption" style={styles.contactCompany}>
            {item.company}
          </Text>
        ) : null}
      </View>
      <View style={styles.contactActions}>
        {item.phone ? (
          <>
            <PressableWithFade
              style={styles.actionButton}
              onPress={() => handleCall(item.phone)}
              accessibilityLabel={`Call ${item.name}`}
            >
              <Ionicons name="call-outline" size={20} color={colors.primary} />
            </PressableWithFade>
            <PressableWithFade
              style={styles.actionButton}
              onPress={() => handleMessage(item.phone)}
              accessibilityLabel={`Message ${item.name}`}
            >
              <Ionicons name="chatbubble-outline" size={20} color={colors.secondary} />
            </PressableWithFade>
          </>
        ) : null}
      </View>
    </View>
  );

  const listPadding = { paddingBottom: sheetListEndPadding(sheetInsets) };

  const handleOpenInvite = () => {
    pendingInviteRef.current = true;
    returnToTeamRef.current = true;
    openedInviteDirectRef.current = false;
    setTeamSheetOpen(false);
  };

  const handleTeamDismissed = () => {
    if (pendingInviteRef.current) {
      pendingInviteRef.current = false;
      setShowInvite(true);
    }
  };

  const handleTeamClose = () => {
    pendingInviteRef.current = false;
    returnToTeamRef.current = false;
    setTeamSheetOpen(false);
    onClose?.();
  };

  const handleInviteClose = () => {
    // Unmount invite Modal first; decide next screen in onDismissed so the closing
    // scrim cannot sit on top of project details (or a newly opened team sheet).
    setInviteDismissFast(true);
    setShowInvite(false);
  };

  const handleInviteDismissed = () => {
    setInviteDismissFast(false);
    if (returnToTeamRef.current) {
      returnToTeamRef.current = false;
      setTeamSheetOpen(true);
      return;
    }
    // Invite was opened directly (e.g. getting-started) — leave project details usable.
    openedInviteDirectRef.current = false;
    onClose?.();
  };

  return (
    <>
      <BottomSheet
        visible={teamSheetOpen}
        title={t('mobile.project_team_tab')}
        onClose={handleTeamClose}
        onDismissed={handleTeamDismissed}
        dismissWithoutAnimation={pendingInviteRef.current}
        snap="medium"
        testID="project-team-sheet"
      >
        <BottomSheet.Scroll contentContainerStyle={listPadding}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text variant="body" style={styles.loadingText}>
                {t('mobile.project_team_loading')}
              </Text>
            </View>
          ) : contacts.length > 0 ? (
            <View style={styles.listContent}>
              {displayedItems.map(renderContact)}
              {hasMore ? (
                <ShowMoreToggle
                  expanded={expanded}
                  hiddenCount={hiddenCount}
                  onPress={() => setExpanded((value) => !value)}
                  testID="project-team-show-more"
                />
              ) : null}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text variant="body" style={styles.emptyText}>
                {t('mobile.project_team_empty')}
              </Text>
            </View>
          )}

          {canInvite ? (
            <View style={styles.inviteBar}>
              <PressableWithFade
                style={styles.inviteBtn}
                onPress={handleOpenInvite}
                testID="project-team-invite-btn"
              >
                <Ionicons name="person-add-outline" size={20} color={colors.primary} />
                <Text variant="bodyMedium" style={styles.inviteBtnText}>
                  {t('mobile.project_invite_title')}
                </Text>
              </PressableWithFade>
            </View>
          ) : null}
        </BottomSheet.Scroll>
      </BottomSheet>

      <ProjectInviteSheet
        visible={showInvite}
        onClose={handleInviteClose}
        onDismissed={handleInviteDismissed}
        dismissWithoutAnimation={inviteDismissFast}
        supabase={supabase}
        project={project}
        userId={user?.id}
        userEmail={user?.email}
        onInvited={loadContacts}
      />
    </>
  );
}

const styles = StyleSheet.create({
  inviteBar: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.minRowHeight,
    paddingVertical: spacing.sm,
  },
  inviteBtnText: { color: colors.primary, fontWeight: '700' },
  loadingContainer: {
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textMuted,
  },
  listContent: {},
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: touch.minRowHeight,
  },
  contactInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  contactName: {
    fontWeight: '600',
    marginBottom: 2,
  },
  contactRole: {
    color: colors.textMuted,
    marginBottom: 2,
  },
  contactCompany: {
    color: colors.textSubtle,
  },
  contactActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    width: touch.minSize,
    height: touch.minSize,
    borderRadius: touch.minSize / 2,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
  },
});
