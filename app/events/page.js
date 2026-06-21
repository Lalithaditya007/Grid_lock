'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { loadEvents } from '@/lib/parseData';
import { getLiveEvents, clearLiveEvents, resolveEvent } from '@/lib/liveEventStore';

function riskColor(s) {
  if (s >= 80) return '#DC2626';
  if (s >= 60) return '#EA580C';
  if (s >= 35) return '#F59E0B';
  return '#16A34A';
}
function riskLabel(s) {
  if (s >= 80) return 'Critical';
  if (s >= 60) return 'High';
  if (s >= 35) return 'Medium';
  return 'Low';
}

// ── Live event row (user-logged) ─────────────────────────────────────────────
function LiveRow({ e, onResolve }) {
  const rc = riskColor(e.score);
  return (
    <tr style={{
      background: 'linear-gradient(90deg, rgba(239,83,80,0.06), transparent)',
      animation: 'fadeUp 0.4s ease both',
    }}>
      {/* Status */}
      <td>
        <span style={{
          background: 'rgba(239,83,80,0.18)', color: '#ff7875',
          border: '1px solid rgba(239,83,80,0.4)', borderRadius: 20,
          padding: '2px 9px', fontSize: 10, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{
            display: 'inline-block', width: 6, height: 6,
            borderRadius: '50%', background: '#ff7875',
            animation: 'pulse-glow 1.4s ease-in-out infinite',
          }} />
          LIVE
        </span>
      </td>
      {/* ID */}
      <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--purple)' }}>{e.id}</td>
      {/* Type */}
      <td>
        <span className={`badge badge-${e.event_type === 'planned' ? 'purple' : 'orange'}`}>
          {e.event_type}
        </span>
      </td>
      {/* Cause */}
      <td>{(e.cause || '').replace(/_/g, ' ')}</td>
      {/* Zone */}
      <td style={{ fontSize: 12 }}>{e.zone || '—'}</td>
      {/* Junction */}
      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.junction || '—'}</td>
      {/* Priority */}
      <td>
        <span className={`badge ${e.priority === 'High' ? 'badge-red' : 'badge-green'}`}>
          {e.priority}
        </span>
      </td>
      {/* Road Closure */}
      <td>
        <span className={`badge ${e.hasClosure ? 'badge-red' : 'badge-green'}`}>
          {e.hasClosure ? 'Yes' : 'No'}
        </span>
      </td>
      {/* AI Score */}
      <td>
        <span style={{
          padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
          background: `${rc}22`, color: rc, border: `1px solid ${rc}40`,
        }}>
          {riskLabel(e.score)} · {e.score}
        </span>
      </td>
      {/* Logged at */}
      <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {e.loggedAt ? new Date(e.loggedAt).toLocaleString('en-IN', {
          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
        }) : e.time}
      </td>
      {/* Duration */}
      <td style={{ fontSize: 12 }}>{e.duration != null ? `${e.duration}h` : '—'}</td>
      {/* Resolve action */}
      <td>
        <button
          onClick={() => onResolve(e.id)}
          style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: 'rgba(39,174,96,0.12)', color: '#5dca8a',
            border: '1px solid rgba(39,174,96,0.3)', cursor: 'pointer',
            transition: 'all 0.2s', fontFamily: 'inherit',
          }}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(39,174,96,0.25)'}
          onMouseOut={e => e.currentTarget.style.background = 'rgba(39,174,96,0.12)'}
        >✓ Resolve</button>
      </td>
    </tr>
  );
}

// ── Historical event row ─────────────────────────────────────────────────────
function HistRow({ e }) {
  function statusBadge(s) {
    const m = { active: 'badge-red', resolved: 'badge-green', closed: 'badge-purple' };
    return m[s] || 'badge-amber';
  }
  return (
    <tr>
      <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</td>
      <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--purple)' }}>{e.id}</td>
      <td><span className={`badge ${e.event_type === 'planned' ? 'badge-purple' : 'badge-orange'}`}>{e.event_type}</span></td>
      <td>{(e.event_cause || '').replace(/_/g, ' ')}</td>
      <td style={{ fontSize: 12 }}>{e.zone || '—'}</td>
      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.junction || '—'}</td>
      <td><span className={`badge ${e.priority === 'High' ? 'badge-red' : 'badge-green'}`}>{e.priority}</span></td>
      <td><span className={`badge ${e.requires_road_closure ? 'badge-red' : 'badge-green'}`}>
        {e.requires_road_closure ? 'Yes' : 'No'}
      </span></td>
      <td><span className={`badge ${statusBadge(e.status)}`}>{e.status}</span></td>
      <td style={{ fontSize: 11, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
        {e.start_datetime ? e.start_datetime.toLocaleDateString('en-IN') : '—'}
      </td>
      <td style={{ fontSize: 12 }}>
        {e.duration_hours != null ? `${e.duration_hours.toFixed(1)}h` : '—'}
      </td>
      <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</td>
    </tr>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function Events() {
  const [all, setAll]           = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [liveEvs, setLiveEvs]   = useState([]);
  const [search, setSearch]     = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const debounceRef = useRef(null);
  const [typeFilter, setTypeFilter]         = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading]   = useState(true);
  const [resolvedCount, setResolvedCount] = useState(0);
  const PER_PAGE = 50;

  useEffect(() => {
    loadEvents().then(evs => { setAll(evs); setFiltered(evs); setLoading(false); });
    // Read live events from localStorage
    const live = getLiveEvents();
    setLiveEvs(live);
  }, []);

  function handleSearch(val) {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(val), 300);
  }

  useEffect(() => {
    let res = all;
    if (typeFilter !== 'all')     res = res.filter(e => e.event_type === typeFilter);
    if (priorityFilter !== 'all') res = res.filter(e => e.priority   === priorityFilter);
    if (debouncedQ) {
      const q = debouncedQ.toLowerCase();
      res = res.filter(e =>
        (e.event_cause || '').toLowerCase().includes(q) ||
        (e.zone        || '').toLowerCase().includes(q) ||
        (e.address     || '').toLowerCase().includes(q) ||
        (e.junction    || '').toLowerCase().includes(q)
      );
    }
    setFiltered(res);
    setPage(1);
  }, [debouncedQ, typeFilter, priorityFilter, all]);

  // Also filter live events by search/type/priority
  const filteredLive = liveEvs.filter(e => {
    if (typeFilter !== 'all' && e.event_type !== typeFilter) return false;
    if (priorityFilter !== 'all' && e.priority !== priorityFilter) return false;
    if (debouncedQ) {
      const q = debouncedQ.toLowerCase();
      return (e.cause || '').toLowerCase().includes(q) ||
             (e.zone  || '').toLowerCase().includes(q) ||
             (e.junction || '').toLowerCase().includes(q);
    }
    return true;
  });

  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const totalCount = liveEvs.length + filtered.length;

  function handleResolve(eventId) {
    resolveEvent(eventId);
    const updated = getLiveEvents();
    setLiveEvs(updated);
    setResolvedCount(c => c + 1);
  }

  function handleClearLive() {
    clearLiveEvents();
    setLiveEvs([]);
  }

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <h2>📋 Event Table</h2>
          <p>
            {liveEvs.length > 0
              ? `${liveEvs.length} live + ${all.length.toLocaleString()} historical events`
              : `Browse, filter, and search all ${all.length.toLocaleString()} traffic events`}
          </p>
        </div>

        <div className="page-body">

          {/* ── Live events banner ── */}
          {/* ── Resolved notification ── */}
          {resolvedCount > 0 && (
            <div className="fade-up" style={{
              marginBottom: 16, padding: '12px 20px',
              background: 'linear-gradient(135deg, rgba(39,174,96,0.10), rgba(41,121,255,0.06))',
              border: '1px solid rgba(39,174,96,0.3)', borderRadius: 12,
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, color: '#5dca8a', fontSize: 13 }}>
                  {resolvedCount} event{resolvedCount > 1 ? 's' : ''} resolved & added to learning pool
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 10 }}>
                  Visit the Learning page to retrain the model
                </span>
              </div>
              <Link href="/learning" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 14px', color: '#5dca8a', border: '1px solid rgba(39,174,96,0.3)' }}>
                🧠 View Learning Pipeline →
              </Link>
            </div>
          )}

          {liveEvs.length > 0 && (
            <div className="fade-up" style={{
              marginBottom: 20, padding: '14px 20px',
              background: 'linear-gradient(135deg, rgba(239,83,80,0.10), rgba(41,121,255,0.06))',
              border: '1px solid rgba(239,83,80,0.3)',
              borderRadius: 12, display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: '#ff7875', flexShrink: 0,
                boxShadow: '0 0 10px #ff787588',
                animation: 'pulse-glow 1.4s ease-in-out infinite',
              }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, color: '#ff7875', fontSize: 13 }}>
                  {liveEvs.length} live event{liveEvs.length > 1 ? 's' : ''} logged this session
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 10 }}>
                  Pinned at the top of the table below
                </span>
              </div>
              <Link href="/log-event" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}>
                ➕ Log Another
              </Link>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 14px', color: 'var(--text-muted)' }}
                onClick={handleClearLive}>
                🗑 Clear Live
              </button>
            </div>
          )}

          {/* ── Filters ── */}
          <div className="glass-card fade-up" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <input className="form-input" style={{ maxWidth: 280 }}
                placeholder="🔍 Search cause, zone, address, junction…"
                value={search} onChange={e => handleSearch(e.target.value)} />

              <div className="chip-row">
                {['all', 'planned', 'unplanned'].map(f => (
                  <button key={f} className={`chip${typeFilter === f ? ' active' : ''}`}
                    onClick={() => setTypeFilter(f)}>
                    {f === 'all' ? 'All Types' : f}
                  </button>
                ))}
              </div>

              <div className="chip-row">
                {['all', 'High', 'Low'].map(f => (
                  <button key={f} className={`chip${priorityFilter === f ? ' active' : ''}`}
                    onClick={() => setPriorityFilter(f)}>
                    {f === 'all' ? 'All Priority' : f}
                  </button>
                ))}
              </div>

              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {(filteredLive.length + filtered.length).toLocaleString()} results
                {filteredLive.length > 0 && (
                  <span style={{ color: '#ff7875', marginLeft: 6 }}>
                    ({filteredLive.length} live)
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* ── Table ── */}
          {loading ? (
            <div className="loading-wrap"><div className="spinner" /></div>
          ) : (
            <div className="glass-card" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Cause</th>
                    <th>Zone</th>
                    <th>Junction</th>
                    <th>Priority</th>
                    <th>Closure</th>
                    <th>Risk / Status</th>
                    <th>Start / Logged</th>
                    <th>Duration</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {/* ── LIVE rows first ── */}
                  {filteredLive.length > 0 && filteredLive.map(e => (
                    <LiveRow key={e.id} e={e} onResolve={handleResolve} />
                  ))}

                  {/* ── Divider if live + historical both present ── */}
                  {filteredLive.length > 0 && paginated.length > 0 && (
                    <tr>
                      <td colSpan={11} style={{
                        padding: '8px 16px', fontSize: 11,
                        color: 'var(--text-muted)', textAlign: 'center',
                        background: 'rgba(41,121,255,0.04)',
                        borderTop: '1px dashed rgba(41,121,255,0.2)',
                        borderBottom: '1px dashed rgba(41,121,255,0.2)',
                      }}>
                        ── Historical Events (8,202 records from ASTRAM dataset) ──
                      </td>
                    </tr>
                  )}

                  {/* ── Historical rows ── */}
                  {paginated.map(e => <HistRow key={e.id} e={e} />)}
                </tbody>
              </table>

              {/* Pagination */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderTop: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Historical: Page {page} of {totalPages}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 12 }}
                    disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                  <button className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 12 }}
                    disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Empty live prompt ── */}
          {!loading && liveEvs.length === 0 && (
            <div style={{
              marginTop: 20, padding: '14px 20px', borderRadius: 12,
              border: '1px dashed rgba(41,121,255,0.2)',
              background: 'rgba(41,121,255,0.03)',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <span style={{ fontSize: 20 }}>💡</span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                No live events logged yet.{' '}
                <Link href="/log-event" style={{ color: 'var(--purple)', fontWeight: 600 }}>
                  Log a new event →
                </Link>{' '}
                and it will appear at the top of this table instantly.
              </span>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
