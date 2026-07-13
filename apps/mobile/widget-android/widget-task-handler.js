import { renderSiteBriefWidget, renderSiteBriefSmallWidget } from './render-site-brief-widget';

export async function widgetTaskHandler(props) {
  const { widgetInfo, widgetAction, renderWidget } = props;

  if (widgetAction === 'WIDGET_DELETED') {
    return;
  }

  switch (widgetInfo.widgetName) {
    case 'SiteBrief':
      renderWidget(await renderSiteBriefWidget());
      break;
    case 'SiteBriefSmall':
      renderWidget(await renderSiteBriefSmallWidget());
      break;
    default:
      break;
  }
}
