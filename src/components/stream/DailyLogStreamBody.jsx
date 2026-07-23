import React from 'react';
import { useTranslation } from 'react-i18next';
import { parseDailyLogPayload } from '@siteweave/core-logic';

const BLOCKER_CATEGORIES = ['delay', 'safety', 'quality'];

function withLabel(items, getLabel) {
  return (items || []).filter((item) => String(getLabel(item) || '').trim().length > 0);
}

function SectionBlock({ title, children }) {
  if (!children) return null;
  return (
    <div className="mb-3">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Bullet({ children }) {
  return <p className="text-sm leading-relaxed text-slate-700">• {children}</p>;
}

export default function DailyLogStreamBody({ post, compact = false }) {
  const { t } = useTranslation();
  const parsed = parseDailyLogPayload(post?.payload);
  const sections = parsed?.sections;

  if (!sections) {
    return <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{post?.body}</div>;
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
  const photos = (parsed.photos || []).filter((photo) => photo?.url);

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
    <div className="space-y-1">
      {userMessage ? (
        <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{userMessage}</p>
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
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{notesFromSections}</p>
        </SectionBlock>
      ) : null}

      {photos.length > 0 && !compact ? (
        <SectionBlock title={t('mobile.site_day_photos')}>
          <div className="flex flex-wrap gap-2">
            {photos.map((photo, i) => (
              <a
                key={photo.url || `p-${i}`}
                href={photo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-lg border border-slate-200"
              >
                <img src={photo.url} alt="" className="h-[72px] w-[72px] object-cover" />
              </a>
            ))}
          </div>
        </SectionBlock>
      ) : null}
    </div>
  );
}
