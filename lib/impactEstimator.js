// impactEstimator.js — engineered impact score (used as ML training target)

export function computeImpactScore(event, stats) {
  const cause = event.event_cause || 'others';
  const zone = event.zone || 'Unknown';

  // Duration weight — normalized (0-40 pts)
  const durH = event.duration_hours || 0;
  const durWeight = Math.min((durH / (stats.maxAvgDuration || 1)) * 40, 40);

  // Road closure weight (25 pts)
  const closureWeight = event.requires_road_closure ? 25 : 0;

  // Historical frequency weight — how often this cause recurs (20 pts)
  const freqWeight = (stats.causeRecurrence[cause] || 0) * 20;

  // Zone congestion weight (15 pts)
  const zoneWeight = (stats.zoneFreq[zone] || 0) * 15;

  const score = Math.round(Math.min(durWeight + closureWeight + freqWeight + zoneWeight, 100));

  return {
    score,
    components: {
      duration: Math.round(durWeight),
      roadClosure: Math.round(closureWeight),
      historicalFrequency: Math.round(freqWeight),
      zoneCongestion: Math.round(zoneWeight),
    },
  };
}
