import React from 'react';
import { useTranslation } from 'react-i18next';
import { parseDailyLogPayload } from '@siteweave/core-logic';

const BLOCKER_CATEGORIES = ['delay', 'safety', 'quality'];

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

  return (
    <div className="space-y-1">
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
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{sections.notes}</p>
        </SectionBlock>
      ) : null}

      {(parsed.photos || []).length > 0 && !compact ? (
        <SectionBlock title={t('mobile.site_day_photos')}>
          <div className="flex flex-wrap gap-2">
            {parsed.photos.map((photo, i) => (
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
