/**
 * Lightweight in-browser notifications when the tab is in the background.
 * No third-party realtime service required.
 */
export function maybeNotifyStreamUpdate({ title, body, projectId }) {
  if (typeof window === 'undefined' || !document.hidden) return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
    return;
  }
  if (Notification.permission !== 'granted') return;

  const n = new Notification(title, {
    body,
    tag: `stream-${projectId}`,
    icon: '/favicon.ico',
  });
  n.onclick = () => {
    window.focus();
    n.close();
  };
}
