// liveEventStore.js — shared localStorage store for user-logged live events
// Used by /log-event (write), /events (read), /learning (resolve + retrain)

const STORAGE_KEY   = 'toip_live_events';
const RESOLVED_KEY  = 'toip_resolved_events';

// ── Write ────────────────────────────────────────────────────────────────────

/** Save a new live event to localStorage */
export function saveLiveEvent(event) {
  if (typeof window === 'undefined') return;
  const existing = getLiveEvents();
  const updated  = [event, ...existing].slice(0, 50);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch (_) {}
}

/** Mark a live event as resolved (moves to resolved pool) */
export function resolveEvent(eventId) {
  if (typeof window === 'undefined') return;
  const live = getLiveEvents();
  const idx  = live.findIndex(e => e.id === eventId);
  if (idx === -1) return;

  const resolvedAt = new Date().toISOString();
  const ev         = live[idx];
  const loggedAt   = new Date(ev.loggedAt || Date.now());
  const resolvedDt = new Date(resolvedAt);
  const actualDurationHours = Math.max(
    0.1,
    (resolvedDt - loggedAt) / 3600000
  );

  const resolved = {
    ...ev,
    status:               'resolved',
    resolvedAt,
    actualDurationHours:  +actualDurationHours.toFixed(2),
  };

  // Remove from live list
  const updatedLive = live.filter(e => e.id !== eventId);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedLive)); } catch (_) {}

  // Add to resolved pool
  const pool = getResolvedPool();
  pool.unshift(resolved);
  try { localStorage.setItem(RESOLVED_KEY, JSON.stringify(pool.slice(0, 100))); } catch (_) {}
}

// ── Read ─────────────────────────────────────────────────────────────────────

/** Get all active live events */
export function getLiveEvents() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

/** Get all resolved events (learning pool) */
export function getResolvedPool() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RESOLVED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

// ── Clear ────────────────────────────────────────────────────────────────────

export function clearLiveEvents()    {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function clearResolvedPool()  {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(RESOLVED_KEY);
}
