import { View, StyleSheet, Image, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { parseDailyLogPayload } from '@siteweave/core-logic';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import { colors, spacing, radius } from '../theme';

const BLOCKER_CATEGORIES = ['delay', 'safety', 'quality'];

function SectionBlock({ title, children }) {
  if (!children) return null;
  return (
    <View style={styles.section}>
      <Text variant="caption" style={styles.sectionTitle}>
        {title}
      </Text>
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

  return (
    <View style={styles.wrap}>
      {(sections.work_completed || []).length > 0 ? (
        <SectionBlock title={t('mobile.site_day_completed')}>
          {sections.work_completed.map((row, i) => (
            <Bullet key={row.task_id || `w-${i}`}>{row.title || t('mobile.site_day_untitled_task')}</Bullet>
          ))}
        </SectionBlock>
      ) : null}

      {(sections.weather || []).length > 0 ? (
        <SectionBlock title={t('mobile.site_day_weather')}>
          {sections.weather.map((row, i) => (
            <Bullet key={row.impact_id || `wx-${i}`}>
              {row.summary || t('mobile.weather_reason_other')}
              {row.days_lost ? ` (${row.days_lost}d)` : ''}
            </Bullet>
          ))}
        </SectionBlock>
      ) : null}

      {(sections.blockers || []).length > 0 ? (
        <SectionBlock title={t('mobile.site_day_blockers')}>
          {sections.blockers.map((row, i) => (
            <Bullet key={row.issue_id || `b-${i}`}>
              {row.title}
              {BLOCKER_CATEGORIES.includes(row.category) && row.category !== 'delay'
                ? ` [${categoryLabel(row.category)}]`
                : ''}
            </Bullet>
          ))}
        </SectionBlock>
      ) : null}

      {(sections.crew_on_site || []).length > 0 ? (
        <SectionBlock title={t('mobile.site_day_crew')}>
          {sections.crew_on_site.map((row, i) => (
            <Bullet key={`c-${i}`}>
              {[row.trade, row.name].filter(Boolean).join(' — ') || t('mobile.site_day_crew_member')}
              {row.count > 1 ? ` (${row.count})` : ''}
            </Bullet>
          ))}
        </SectionBlock>
      ) : null}

      {sections.notes ? (
        <SectionBlock title={t('mobile.site_day_notes')}>
          <Text variant="body" style={styles.notes}>
            {sections.notes}
          </Text>
        </SectionBlock>
      ) : null}

      {(parsed.photos || []).length > 0 && !compact ? (
        <SectionBlock title={t('mobile.site_day_photos')}>
          <View style={styles.photoRow}>
            {parsed.photos.map((photo, i) => (
              <PressableWithFade
                key={photo.url || `p-${i}`}
                onPress={() => photo.url && Linking.openURL(photo.url)}
                style={styles.photoThumbWrap}
              >
                <Image source={{ uri: photo.url }} style={styles.photoThumb} resizeMode="cover" />
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
});
