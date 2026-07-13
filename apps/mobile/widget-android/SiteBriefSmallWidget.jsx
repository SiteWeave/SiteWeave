import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { WIDGET_STATES } from '../utils/widgetSnapshot';

export function SiteBriefSmallWidget({ snapshot }) {
  const deepLink = snapshot?.deepLink || 'siteweave:///(tabs)';
  const accent = snapshot?.primaryColor || '#3B82F6';

  let lineOne = 'SiteWeave';
  let lineTwo = 'Open app';

  if (snapshot?.state === WIDGET_STATES.LOGGED_OUT) {
    lineOne = 'Sign in';
    lineTwo = 'Tap to open';
  } else if (snapshot) {
    const due = snapshot.kpis?.dueToday ?? 0;
    const overdue = snapshot.kpis?.overdue ?? 0;
    lineOne = `${due} due · ${overdue} overdue`;
    const weather = snapshot.weather;
    if (weather?.tempF != null) {
      lineTwo = `${weather.tempF}° ${weather.precipPct != null ? `${weather.precipPct}% precip` : weather.condition || ''}`.trim();
    } else {
      lineTwo = snapshot.pinnedProject?.name || 'Site brief';
    }
  }

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: deepLink }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 12,
        justifyContent: 'center',
        flexDirection: 'column',
        flexGap: 4,
      }}
    >
      <TextWidget text={lineOne} style={{ fontSize: 14, fontWeight: '700', color: '#111827' }} maxLines={1} truncate="END" />
      <TextWidget text={lineTwo} style={{ fontSize: 12, color: accent }} maxLines={2} truncate="END" />
    </FlexWidget>
  );
}
