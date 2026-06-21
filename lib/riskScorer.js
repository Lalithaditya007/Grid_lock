// riskScorer.js — DATA-DRIVEN risk scoring (no hand-crafted weights)
// Every component is derived from historical statistics via statsBuilder

export function computeRiskScore(event, stats) {
  const zone = event.zone || 'Unknown';
  const cause = event.event_cause || 'others';
  const durationHours = event.duration_hours || 0;

  // Component 1 — cause recurrence (30 pts)
  const causeRec = stats.causeRecurrence[cause] || 0;
  const c1 = causeRec * 30;

  // Component 2 — zone frequency (25 pts)
  const zoneFreq = stats.zoneFreq[zone] || 0;
  const c2 = zoneFreq * 25;

  // Component 3 — zone closure rate (25 pts)
  const closureRate = stats.zoneClosureRate[zone] || 0;
  const c3 = closureRate * 25;

  // Component 4 — duration factor (20 pts)
  const durationFactor = stats.maxAvgDuration > 0
    ? Math.min(durationHours / stats.maxAvgDuration, 1)
    : 0;
  const c4 = durationFactor * 20;

  const total = Math.round(c1 + c2 + c3 + c4);

  return {
    score: Math.min(total, 100),
    breakdown: {
      causeRecurrence: Math.round(c1),
      zoneFrequency: Math.round(c2),
      zoneClosureRate: Math.round(c3),
      durationFactor: Math.round(c4),
    },
    labels: {
      causeRecurrenceNote: `"${cause}" appears in ${Math.round(causeRec * 100)}% of historical events`,
      zoneFrequencyNote: `Zone "${zone}" has ${Math.round(zoneFreq * 100)}% relative incident density`,
      zoneClosureRateNote: `${Math.round(closureRate * 100)}% of incidents in this zone required road closure`,
      durationNote: `Event duration ${durationHours.toFixed(1)}h vs max observed ${stats.maxAvgDuration.toFixed(1)}h`,
    },
  };
}

export function getRiskLevel(score) {
  if (score >= 80) return { label: 'Critical', color: '#FF4757' };
  if (score >= 60) return { label: 'High', color: '#FF6B35' };
  if (score >= 35) return { label: 'Medium', color: '#FFD32A' };
  return { label: 'Low', color: '#43E97B' };
}
