import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { WIDGET_STATES, formatWidgetStaleLabel } from '../utils/widgetSnapshot';

const COLORS = {
  bg: '#FFFFFF',
  text: '#111827',
  muted: '#6B7280',
  accent: '#3B82F6',
  danger: '#DC2626',
  border: '#E5E7EB',
};

function widgetHeadline(snapshot) {
  if (!snapshot) return 'SiteWeave';
  if (snapshot.state === WIDGET_STATES.LOGGED_OUT) return 'Sign in to SiteWeave';
  if (snapshot.state === WIDGET_STATES.OFFLINE) return 'Offline';
  if (snapshot.pinnedProject?.name) return snapshot.pinnedProject.name;
  return 'SiteWeave';
}

function widgetSubhead(snapshot) {
  if (!snapshot) return 'Open app to sync';
  if (snapshot.state === WIDGET_STATES.LOGGED_OUT) return 'Open SiteWeave to sign in';
  if (snapshot.state === WIDGET_STATES.EMPTY) return 'Nothing due today';

  const parts = [];
  if (snapshot.kpis?.dueToday) parts.push(`${snapshot.kpis.dueToday} due`);
  if (snapshot.kpis?.overdue) parts.push(`${snapshot.kpis.overdue} overdue`);
  if (!parts.length) parts.push('All clear today');
  return parts.join(' · ');
}

function weatherLine(snapshot) {
  const weather = snapshot?.weather;
  if (!weather || weather.tempF == null) return null;
  const precip = weather.precipPct != null ? `${weather.precipPct}%` : '';
  return `${weather.tempF}° ${weather.condition || ''}${precip ? ` · ${precip}` : ''}`.trim();
}

function footerLine(snapshot) {
  if (!snapshot) return null;
  const stale = formatWidgetStaleLabel(snapshot.updatedAt);
  const unread = snapshot.kpis?.unreadNotifications;
  const pending = snapshot.sync?.pendingCount;
  const bits = [];
  if (snapshot.state === WIDGET_STATES.OFFLINE && pending) bits.push(`${pending} pending`);
  if (unread) bits.push(`${unread} unread`);
  if (stale) bits.push(stale);
  return bits.join(' · ') || stale;
}

function myDayRows(snapshot) {
  return (snapshot?.myDay || []).slice(0, 3);
}

export function SiteBriefWidget({ snapshot }) {
  const deepLink = snapshot?.deepLink || 'siteweave:///(tabs)';
  const accent = snapshot?.primaryColor || COLORS.accent;
  const weather = weatherLine(snapshot);
  const rows = myDayRows(snapshot);

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: deepLink }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: COLORS.bg,
        borderRadius: 16,
        padding: 14,
        flexDirection: 'column',
        flexGap: 8,
      }}
    >
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
        }}
      >
        <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
          <TextWidget
            text={widgetHeadline(snapshot)}
            style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}
            maxLines={1}
            truncate="END"
          />
          <TextWidget
            text={widgetSubhead(snapshot)}
            style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}
            maxLines={1}
            truncate="END"
          />
        </FlexWidget>
        {weather ? (
          <TextWidget
            text={weather}
            style={{ fontSize: 11, color: COLORS.muted, textAlign: 'right' }}
            maxLines={2}
            truncate="END"
          />
        ) : null}
      </FlexWidget>

      <FlexWidget
        style={{
          height: 1,
          width: 'match_parent',
          backgroundColor: COLORS.border,
        }}
      />

      {rows.length ? (
        rows.map((row) => (
          <FlexWidget
            key={`${row.type}-${row.id}`}
            clickAction="OPEN_URI"
            clickActionData={{ uri: row.deepLink || deepLink }}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: 'match_parent',
            }}
          >
            <TextWidget
              text={`• ${row.title}`}
              style={{ fontSize: 13, color: COLORS.text, flex: 1 }}
              maxLines={1}
              truncate="END"
            />
            <TextWidget
              text={row.type === 'event' ? row.time || '' : row.statusLabel || ''}
              style={{
                fontSize: 11,
                color: row.status?.startsWith('overdue') ? COLORS.danger : COLORS.muted,
                marginLeft: 8,
              }}
              maxLines={1}
            />
          </FlexWidget>
        ))
      ) : (
        <TextWidget
          text={snapshot?.state === WIDGET_STATES.LOGGED_OUT ? 'Tap to sign in' : 'Your day is clear'}
          style={{ fontSize: 13, color: COLORS.muted }}
        />
      )}

      <FlexWidget style={{ flex: 1 }} />

      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
        }}
      >
        <TextWidget
          text={footerLine(snapshot) || 'SiteWeave'}
          style={{ fontSize: 10, color: COLORS.muted, flex: 1 }}
          maxLines={1}
          truncate="END"
        />
        <TextWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'siteweave:///(tabs)?action=site-day' }}
          text="Log site day"
          style={{ fontSize: 11, fontWeight: '600', color: accent, marginLeft: 8 }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
