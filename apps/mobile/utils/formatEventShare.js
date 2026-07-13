export function formatEventShareText(event) {
  if (!event) return '';
  const title = event.title || 'Event';
  const lines = [title];

  if (event.start_time) {
    const start = new Date(event.start_time);
    const dateStr = start.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (event.is_all_day) {
      lines.push(`When: ${dateStr} (all day)`);
    } else {
      const timeStr = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      let range = timeStr;
      if (event.end_time) {
        const end = new Date(event.end_time);
        range += ` – ${end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
      }
      lines.push(`When: ${dateStr}, ${range}`);
    }
  }

  if (event.location) {
    lines.push(`Where: ${event.location}`);
  }
  if (event.description) {
    lines.push('');
    lines.push(event.description);
  }

  lines.push('');
  lines.push('— SiteWeave');
  return lines.join('\n');
}
