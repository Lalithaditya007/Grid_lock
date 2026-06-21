// parseData.js — CSV loader with singleton Promise (never parses twice)
import Papa from 'papaparse';

// Singleton Promise — shared across all pages so CSV is only fetched + parsed once
let parsePromise = null;

export function loadEvents() {
  if (parsePromise) return parsePromise;

  parsePromise = fetch('/data/events.csv')
    .then(res => res.text())
    .then(text => new Promise(resolve => {
      // Parse off the critical path using Papa's async worker when available
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        worker: false, // runs synchronously but deferred by the Promise chain
        complete: ({ data }) => {
          const events = data.map(row => {
            const start = row.start_datetime ? new Date(row.start_datetime) : null;
            const end   = row.end_datetime && row.end_datetime !== 'NULL'
              ? new Date(row.end_datetime) : null;
            const durationHours = (start && end && end > start)
              ? (end - start) / 3600000 : null;

            return {
              id: row.id,
              event_type: row.event_type || 'unplanned',
              event_cause: row.event_cause || 'others',
              latitude: parseFloat(row.latitude) || 0,
              longitude: parseFloat(row.longitude) || 0,
              address: row.address || '',
              start_datetime: start,
              end_datetime: end,
              duration_hours: durationHours,
              requires_road_closure: (row.requires_road_closure || '').toLowerCase() === 'true',
              priority: row.priority || 'Low',
              zone: row.zone || 'Unknown',
              junction: row.junction || '',
              status: row.status || 'closed',
              direction: row.direction || '',
              corridor: row.corridor || '',
              police_station: row.police_station || '',
            };
          }).filter(r => r.latitude !== 0 && r.longitude !== 0);

          resolve(events);
        },
      });
    }));

  return parsePromise;
}
