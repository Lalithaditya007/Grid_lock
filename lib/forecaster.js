// forecaster.js — temporal analytics and pattern detection

export function buildTemporalStats(events) {
  const byHour = Array(24).fill(0);
  const byDay = Array(7).fill(0);
  const byMonth = Array(12).fill(0);
  const byZone = {};
  const byCause = {};
  const byType = { planned: 0, unplanned: 0 };
  const byPriority = { High: 0, Low: 0 };
  const byZonePriority = {};

  for (const e of events) {
    const dt = e.start_datetime;
    if (dt) {
      byHour[dt.getHours()]++;
      byDay[dt.getDay()]++;
      byMonth[dt.getMonth()]++;
    }
    const zone = e.zone || 'Unknown';
    byZone[zone] = (byZone[zone] || 0) + 1;
    byCause[e.event_cause] = (byCause[e.event_cause] || 0) + 1;
    if (e.event_type) byType[e.event_type] = (byType[e.event_type] || 0) + 1;
    if (e.priority) byPriority[e.priority] = (byPriority[e.priority] || 0) + 1;

    if (!byZonePriority[zone]) byZonePriority[zone] = { High: 0, Low: 0 };
    byZonePriority[zone][e.priority] = (byZonePriority[zone][e.priority] || 0) + 1;
  }

  return { byHour, byDay, byMonth, byZone, byCause, byType, byPriority, byZonePriority };
}

export function predictWeekRisk(stats, events) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const maxDay = Math.max(...stats.byDay, 1);
  const today = new Date();

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayIdx = d.getDay();
    const monthIdx = d.getMonth();

    const dayWeight = stats.byDay[dayIdx] / maxDay;
    const monthFactor = stats.byMonth[monthIdx] / Math.max(...stats.byMonth, 1);
    // Combine for 0-100 risk estimate
    const risk = Math.round((dayWeight * 0.6 + monthFactor * 0.4) * 100);
    return {
      date: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      dayName: days[dayIdx],
      risk,
    };
  });
}
