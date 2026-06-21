// statsBuilder.js — derives all statistics from raw event data
// These are the DATA-DRIVEN foundations for risk scoring

export function buildStats(events) {
  const zoneCounts = {};
  const zoneClosures = {};
  const causeCounts = {};
  const causeDurations = {};
  const total = events.length;

  for (const e of events) {
    const zone = e.zone || 'Unknown';
    const cause = e.event_cause || 'others';

    zoneCounts[zone] = (zoneCounts[zone] || 0) + 1;
    if (e.requires_road_closure) zoneClosures[zone] = (zoneClosures[zone] || 0) + 1;

    causeCounts[cause] = (causeCounts[cause] || 0) + 1;
    if (e.duration_hours != null) {
      if (!causeDurations[cause]) causeDurations[cause] = [];
      causeDurations[cause].push(e.duration_hours);
    }
  }

  // Normalize zone frequency 0-1
  const maxZoneCount = Math.max(...Object.values(zoneCounts), 1);
  const zoneFreq = {};
  for (const z in zoneCounts) zoneFreq[z] = zoneCounts[z] / maxZoneCount;

  // Zone closure rate 0-1
  const zoneClosureRate = {};
  for (const z in zoneCounts) {
    zoneClosureRate[z] = (zoneClosures[z] || 0) / zoneCounts[z];
  }

  // Cause recurrence 0-1 (proportion of total events)
  const maxCauseCount = Math.max(...Object.values(causeCounts), 1);
  const causeRecurrence = {};
  for (const c in causeCounts) causeRecurrence[c] = causeCounts[c] / maxCauseCount;

  // Cause average duration (hours)
  const causeAvgDuration = {};
  let maxAvgDuration = 1;
  for (const c in causeDurations) {
    const arr = causeDurations[c];
    causeAvgDuration[c] = arr.reduce((s, v) => s + v, 0) / arr.length;
    if (causeAvgDuration[c] > maxAvgDuration) maxAvgDuration = causeAvgDuration[c];
  }

  // All zones and causes for dropdowns
  const zones = Object.keys(zoneCounts).sort();
  const causes = Object.keys(causeCounts).sort();

  return {
    zoneFreq,
    zoneClosureRate,
    causeRecurrence,
    causeAvgDuration,
    maxAvgDuration,
    zoneCounts,
    causeCounts,
    zones,
    causes,
    total,
  };
}
