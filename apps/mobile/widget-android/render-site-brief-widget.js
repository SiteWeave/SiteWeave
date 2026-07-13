import React from 'react';
import { SiteBriefWidget } from './SiteBriefWidget';
import { SiteBriefSmallWidget } from './SiteBriefSmallWidget';
import { getWidgetSnapshotForTaskHandler } from '../utils/widgetBridge';

export async function renderSiteBriefWidget() {
  const snapshot = await getWidgetSnapshotForTaskHandler();
  return <SiteBriefWidget snapshot={snapshot} />;
}

export async function renderSiteBriefSmallWidget() {
  const snapshot = await getWidgetSnapshotForTaskHandler();
  return <SiteBriefSmallWidget snapshot={snapshot} />;
}
