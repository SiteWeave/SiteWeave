import { View, StyleSheet, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { parseDailyLogPayload } from '@siteweave/core-logic';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import RemoteImage from './RemoteImage';
import { colors, spacing, radius } from '../theme';

const BLOCKER_CATEGORIES = ['delay', 'safety', 'quality'];

function withLabel(items, getLabel) {
  return (items || []).filter((item) => String(getLabel(item) || '').trim().length > 0);
}

function SectionBlock({ title, children }) {
  if (!children) return null;
  return (
    <View style={styles.section}>
      {title ? (
        <Text variant="caption" style={styles.sectionTitle}>
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

function Bullet({ children }) {
  return (
    <Text variant="body" style={styles.bullet}>
      • {children}
    </Text>
  );
}

export default function DailyLogStreamBody({ post, compact = false }) {
  const { t } = useTranslation();
  const parsed = parseDailyLogPayload(post?.payload);
  const sections = parsed?.sections;

  if (!sections) {
    return (
      <Text variant="body" style={styles.fallbackBody}>
        {post?.body}
      </Text>
    );
  }

  const categoryLabel = (cat) => {
    if (cat === 'safety') return t('mobile.site_day_category_safety');
    if (cat === 'quality') return t('mobile.site_day_category_quality');
    return t('mobile.site_day_category_delay');
  };

  const workCompleted = withLabel(sections.work_completed, (row) => row.title);
  const weather = withLabel(
    sections.weather,
    (row) => row.summary || (row.days_lost != null ? String(row.days_lost) : ''),
  );
  const blockers = withLabel(sections.blockers, (row) => row.title);
  const crew = withLabel(sections.crew_on_site, (row) => [row.trade, row.name].filter(Boolean).join(' '));
  const photos = (parsed.photos || [])
    .map((photo) => {
      if (!photo) return null;
      if (typeof photo === 'string') return { url: photo };
      return photo;
    })
    .filter((photo) => photo?.url);

  // Legacy / partial payloads sometimes only set top-level file_url.
  if (photos.length === 0 && post?.file_url) {
    photos.push({ url: post.file_url, file_name: post.file_name || null });
  }

  const notesFromSections = String(sections.notes || '').trim();
  const bodyText = String(post?.body || '').trim();
  const hasStructured =
    workCompleted.length > 0 ||
    weather.length > 0 ||
    blockers.length > 0 ||
    crew.length > 0 ||
    photos.length > 0;
  // Prefer user notes; use body when it matches notes, or when there is no structured dump to re-show.
  const userMessage =
    notesFromSections ||
    (bodyText && (!hasStructured || bodyText === notesFromSections) ? bodyText : '');
  const notesAlreadyShown =
    Boolean(userMessage) && (!notesFromSections || userMessage === notesFromSections);

  return (
    <View style={styles.wrap}>
      {userMessage ? (
        <Text variant="body" style={styles.userMessage}>
          {userMessage}
        </Text>
      ) : null}

      {workCompleted.length > 0 ? (
        <SectionBlock title={t('mobile.site_day_completed')}>
          {workCompleted.map((row, i) => (
            <Bullet key={row.task_id || `w-${i}`}>{row.title}</Bullet>
          ))}
        </SectionBlock>
      ) : null}

      {weather.length > 0 ? (
        <SectionBlock title={t('mobile.site_day_weather')}>
          {weather.map((row, i) => (
            <Bullet key={row.impact_id || `wx-${i}`}>
              {row.summary || t('mobile.weather_reason_other')}
              {row.days_lost ? ` (${row.days_lost}d)` : ''}
            </Bullet>
          ))}
        </SectionBlock>
      ) : null}

      {blockers.length > 0 ? (
        <SectionBlock title={t('mobile.site_day_blockers')}>
          {blockers.map((row, i) => (
            <Bullet key={row.issue_id || `b-${i}`}>
              {row.title}
              {BLOCKER_CATEGORIES.includes(row.category) && row.category !== 'delay'
                ? ` [${categoryLabel(row.category)}]`
                : ''}
            </Bullet>
          ))}
        </SectionBlock>
      ) : null}

      {crew.length > 0 ? (
        <SectionBlock title={t('mobile.site_day_crew')}>
          {crew.map((row, i) => (
            <Bullet key={`c-${i}`}>
              {[row.trade, row.name].filter(Boolean).join(' — ') || t('mobile.site_day_crew_member')}
              {row.count > 1 ? ` (${row.count})` : ''}
            </Bullet>
          ))}
        </SectionBlock>
      ) : null}

      {notesFromSections && !notesAlreadyShown ? (
        <SectionBlock title={t('mobile.site_day_notes')}>
          <Text variant="body" style={styles.notes}>
            {notesFromSections}
          </Text>
        </SectionBlock>
      ) : null}

      {photos.length > 0 ? (
        <SectionBlock title={compact ? undefined : t('mobile.site_day_photos')}>
          <View style={styles.photoRow}>
            {photos.map((photo, i) => (
              <PressableWithFade
                key={photo.url || `p-${i}`}
                onPress={() => photo.url && Linking.openURL(photo.url)}
                style={styles.photoThumbWrap}
              >
                <RemoteImage
                  uri={photo.url}
                  style={compact ? styles.photoThumbCompact : styles.photoThumb}
                  recyclingKey={`stream-photo-${photo.url || i}`}
                />
              </PressableWithFade>
            ))}
          </View>
        </SectionBlock>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  fallbackBody: { lineHeight: 22 },
  userMessage: { lineHeight: 22, color: colors.text, marginBottom: spacing.xs },
  section: { gap: 2 },
  sectionTitle: {
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  bullet: { lineHeight: 22, color: colors.text },
  notes: { lineHeight: 22, color: colors.text },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  photoThumbWrap: { borderRadius: radius.card, overflow: 'hidden' },
  photoThumb: { width: 72, height: 72, backgroundColor: colors.surfaceMuted },
  photoThumbCompact: { width: 64, height: 64, backgroundColor: colors.surfaceMuted },
});
