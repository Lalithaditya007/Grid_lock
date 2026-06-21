'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { loadEvents } from '@/lib/parseData';
import { buildStats } from '@/lib/statsBuilder';
import { trainEnsemble, predict, isModelTrained } from '@/lib/mlModel';
import { getResourceRecommendation } from '@/lib/resourceEngine';
import { saveLiveEvent } from '@/lib/liveEventStore';

// ─── Cause options matching dataset values ───────────────────────────────────
const CAUSE_OPTIONS = [
  { value: 'vehicle_breakdown',  label: '🚗 Vehicle Breakdown' },
  { value: 'accident',           label: '💥 Accident' },
  { value: 'tree_fall',          label: '🌳 Tree Fall' },
  { value: 'road_work',          label: '🔧 Road Work / Construction' },
  { value: 'waterlogging',       label: '🌊 Waterlogging' },
  { value: 'procession',         label: '🚶 Procession / Rally / Festival' },
  { value: 'sports_event',       label: '🏟️ Sports Event' },
  { value: 'vip_movement',       label: '🚨 VIP Movement' },
  { value: 'fire',               label: '🔥 Fire / Emergency' },
  { value: 'others',             label: '📌 Others' },
];

const ZONE_OPTIONS = [
  'Central Zone 1', 'Central Zone 2', 'East Zone 1', 'East Zone 2',
  'North Zone 1', 'North Zone 2', 'South Zone 1', 'South Zone 2',
  'West Zone 1', 'West Zone 2', 'Unknown',
];

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

// ─── Resource card sub-component ─────────────────────────────────────────────
function ResourceCard({ icon, value, label, color }) {
  return (
    <div style={{
      background: 'rgba(41,121,255,0.06)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '18px 20px', display: 'flex',
      alignItems: 'center', gap: 16, transition: 'all 0.2s',
    }}>
      <div style={{ fontSize: 32 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</div>
      </div>
    </div>
  );
}

// ─── Live event row ───────────────────────────────────────────────────────────
function LiveEventRow({ ev, index }) {
  const rc = riskColor(ev.score);
  return (
    <tr style={{ animation: 'fadeUp 0.4s ease both', animationDelay: `${index * 60}ms` }}>
      <td>
        <span style={{
          background: 'rgba(239,83,80,0.15)', color: '#ff7875',
          border: '1px solid rgba(239,83,80,0.3)', borderRadius: 20,
          padding: '2px 8px', fontSize: 10, fontWeight: 700,
        }}>🔴 LIVE</span>
      </td>
      <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--purple)' }}>{ev.id}</td>
      <td><span className={`badge badge-${ev.event_type === 'planned' ? 'purple' : 'orange'}`}>{ev.event_type}</span></td>
      <td>{ev.cause.replace(/_/g, ' ')}</td>
      <td style={{ fontSize: 12 }}>{ev.zone}</td>
      <td>
        <span style={{
          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
          background: `${rc}22`, color: rc, border: `1px solid ${rc}44`,
        }}>{riskLabel(ev.score)} · {ev.score}</span>
      </td>
      <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{ev.time}</td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LogEventPage() {
  const [modelReady, setModelReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [trainPct, setTrainPct] = useState(0);
  const [zones, setZones] = useState(ZONE_OPTIONS);
  const [liveEvents, setLiveEvents] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);   // { score, low, high, resources }
  const [submitting, setSubmitting] = useState(false);

  const now = new Date();
  const [form, setForm] = useState({
    eventType: 'unplanned',
    cause: 'vehicle_breakdown',
    zone: 'Central Zone 1',
    junction: '',
    hour: now.getHours(),
    month: now.getMonth() + 1,
    duration: 2,
    hasClosure: false,
    priority: 'High',
    description: '',
    reporterName: '',
    contactNo: '',
  });

  // ── Train model on mount ────────────────────────────────────────────────────
  useEffect(() => {
    loadEvents().then(async evs => {
      const s = buildStats(evs);
      setZones(s.zones.length ? s.zones : ZONE_OPTIONS);
      setForm(f => ({ ...f, zone: (s.zones || ZONE_OPTIONS)[0] }));

      if (!isModelTrained()) {
        await trainEnsemble(evs, s, (pct) => setTrainPct(pct));
      }
      setModelReady(true);
      setModelLoading(false);
    });
  }, []);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function handleSubmit() {
    if (!modelReady) return;
    setSubmitting(true);

    setTimeout(() => {
      const pred = predict({
        zone: form.zone,
        cause: form.cause,
        junction: form.junction,
        hour: form.hour,
        month: form.month,
        hasClosure: form.hasClosure,
        priority: form.priority,
        eventType: form.eventType,
        duration: form.duration,
      });

      const resources = getResourceRecommendation(pred.score);

      const newEvent = {
        id: `LIVE-${Date.now().toString(36).toUpperCase()}`,
        event_type: form.eventType,
        cause: form.cause,
        zone: form.zone,
        junction: form.junction || '—',
        score: pred.score,
        priority: form.priority,
        hasClosure: form.hasClosure,
        duration: form.duration,
        description: form.description || '',
        reporterName: form.reporterName || '',
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        loggedAt: new Date().toISOString(),
      };

      // Persist to localStorage so /events table picks it up
      saveLiveEvent(newEvent);

      setResult({ ...pred, resources, event: newEvent });
      setLiveEvents(prev => [newEvent, ...prev]);
      setSubmitted(true);
      setSubmitting(false);
    }, 600);
  }

  function resetForm() {
    setSubmitted(false);
    setResult(null);
    setForm(f => ({
      ...f,
      junction: '',
      description: '',
      reporterName: '',
      contactNo: '',
      hasClosure: false,
    }));
  }

  const rc = result ? riskColor(result.score) : 'var(--purple)';

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="main-content">
        {/* ── Header ── */}
        <div className="page-header">
          <h2>📍 Event Intake</h2>
          <p>Log a traffic event · Get instant AI impact prediction · Receive deployment recommendations</p>
        </div>

        <div className="page-body" style={{ paddingBottom: 60 }}>

          {/* ── Model status bar — minimal, not prominent per spec ── */}
          {!modelReady && (
            <div style={{
              marginBottom: 20, padding: '10px 16px', borderRadius: 8,
              background: '#EFF6FF', border: '1px solid rgba(37,99,235,0.2)',
              display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
            }}>
              <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
              <span style={{ color: '#1D4ED8' }}>Preparing AI engine… {trainPct}%</span>
            </div>
          )}

          {/* ── Main two-column layout ── */}
          <div className="grid-sidebar" style={{ gap: 24, alignItems: 'start' }}>

            {/* ── LEFT: Form ── */}
            <div className="glass-card fade-up">
              <div className="section-title" style={{ marginBottom: 20 }}>📝 Event Details</div>

              {/* Event type chips */}
              <div className="form-group">
                <label className="form-label">Event Type</label>
                <div className="chip-row">
                  {[
                    { val: 'unplanned', label: '🚨 Unplanned' },
                    { val: 'planned',   label: '📅 Planned' },
                  ].map(t => (
                    <button key={t.val}
                      className={`chip${form.eventType === t.val ? ' active' : ''}`}
                      onClick={() => set('eventType', t.val)}
                    >{t.label}</button>
                  ))}
                </div>
              </div>

              {/* Cause */}
              <div className="form-group">
                <label className="form-label">Event Cause</label>
                <select className="form-select" value={form.cause}
                  onChange={e => set('cause', e.target.value)}>
                  {CAUSE_OPTIONS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Zone + Junction */}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Zone</label>
                  <select className="form-select" value={form.zone}
                    onChange={e => set('zone', e.target.value)}>
                    {zones.map(z => <option key={z}>{z}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Junction / Landmark</label>
                  <input className="form-input" placeholder="e.g. Silk Board Junction"
                    value={form.junction} onChange={e => set('junction', e.target.value)} />
                </div>
              </div>

              {/* Priority chips */}
              <div className="form-group">
                <label className="form-label">Priority</label>
                <div className="chip-row">
                  {['High', 'Low'].map(p => (
                    <button key={p}
                      className={`chip${form.priority === p ? ' active' : ''}`}
                      onClick={() => set('priority', p)}>
                      {p === 'High' ? '🔴 High' : '🟢 Low'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Road closure */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.hasClosure}
                    onChange={e => set('hasClosure', e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--purple)' }} />
                  Road Closure Required
                </label>
              </div>

              {/* Hour + Month sliders */}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">
                    Hour — {form.hour}:00{((form.hour >= 7 && form.hour <= 10) || (form.hour >= 17 && form.hour <= 20)) ? ' ⚡ Peak' : ''}
                  </label>
                  <input type="range" min="0" max="23" value={form.hour}
                    onChange={e => set('hour', +e.target.value)}
                    style={{ width: '100%', accentColor: 'var(--purple)' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Month — {'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[form.month - 1]}
                  </label>
                  <input type="range" min="1" max="12" value={form.month}
                    onChange={e => set('month', +e.target.value)}
                    style={{ width: '100%', accentColor: 'var(--purple)' }} />
                </div>
              </div>

              {/* Duration */}
              <div className="form-group">
                <label className="form-label">Expected Duration — {form.duration}h</label>
                <input type="range" min="0" max="48" value={form.duration}
                  onChange={e => set('duration', +e.target.value)}
                  style={{ width: '100%', accentColor: 'var(--purple)' }} />
              </div>

              {/* Reporter info */}
              <div className="grid-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Reported By (optional)</label>
                  <input className="form-input" placeholder="Officer / Citizen name"
                    value={form.reporterName} onChange={e => set('reporterName', e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Contact No. (optional)</label>
                  <input className="form-input" placeholder="+91 XXXXX XXXXX"
                    value={form.contactNo} onChange={e => set('contactNo', e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 20, marginBottom: 0 }}>
                <label className="form-label">Description (optional)</label>
                <textarea className="form-input" rows={2} placeholder="Brief description of the situation…"
                  value={form.description} onChange={e => set('description', e.target.value)}
                  style={{ resize: 'vertical', lineHeight: 1.5 }} />
              </div>

              {/* Submit / Reset buttons */}
              <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
                <button className="btn btn-primary pulse" style={{ flex: 1 }}
                  onClick={handleSubmit}
                  disabled={!modelReady || submitting}>
                   {submitting ? '⏳ Analyzing…' : modelReady ? '🚦 Get Impact Prediction & Log Event' : '⏳ Preparing AI…'}
                </button>
                {submitted && (
                  <button className="btn btn-ghost" onClick={resetForm}>↩ Log Another</button>
                )}
              </div>
            </div>

            {/* ── RIGHT: Result ── */}
            <div>
              {result ? (
                <div className="fade-up">
                  {/* Impact Score */}
                  <div className="glass-card" style={{
                    textAlign: 'center', marginBottom: 20,
                    padding: '40px 24px', border: `1px solid ${rc}33`,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                      Live Impact Preview
                    </div>
                    <div style={{ fontSize: 86, fontWeight: 900, letterSpacing: -4, color: rc, lineHeight: 1 }}>
                      {result.score}
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <span style={{
                        padding: '5px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700,
                        background: `${rc}22`, color: rc, border: `1px solid ${rc}44`,
                      }}>{riskLabel(result.score)} RISK</span>
                    </div>
                    <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
                      Confidence range: <span style={{ color: rc, fontWeight: 700 }}>{result.low} – {result.high}</span>
                    </div>
                    {/* Range bar */}
                    <div style={{ margin: '12px auto 0', maxWidth: 220, height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, position: 'relative' }}>
                      <div style={{
                        position: 'absolute', left: `${result.low}%`, width: `${result.high - result.low}%`,
                        height: '100%', background: `${rc}55`, borderRadius: 4,
                      }} />
                      <div style={{
                        position: 'absolute', left: `${result.score}%`, transform: 'translateX(-50%)',
                        width: 12, height: 12, borderRadius: '50%', background: rc,
                        top: -2, border: '2px solid #081121',
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4, maxWidth: 220, margin: '6px auto 0' }}>
                      <span>0 Low</span><span>50</span><span>100 Critical</span>
                    </div>
                  </div>

                  {/* Resource Plan */}
                  <div className="glass-card" style={{ marginBottom: 20 }}>
                    <div className="section-title" style={{ marginBottom: 16 }}>
                      🚔 Recommended Resource Deployment
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                      <ResourceCard icon="👮" value={result.resources.officers} label="Police Officers" color={rc} />
                      <ResourceCard icon="🚧" value={result.resources.barricades} label="Barricade Points" color={rc} />
                      <ResourceCard icon="🔀" value={result.resources.diversionRoutes} label="Diversion Routes" color={rc} />
                      <ResourceCard icon="⏱️" value={`${form.duration}h`} label="Est. Duration" color="var(--purple)" />
                    </div>

                    {/* Response label */}
                    <div style={{
                      padding: '10px 14px', borderRadius: 10, marginBottom: 14,
                      background: `${rc}12`, border: `1px solid ${rc}30`,
                      fontWeight: 700, fontSize: 13, color: rc,
                    }}>
                      📋 {result.resources.label}
                    </div>

                    {/* Action notes */}
                    <div>
                      {result.resources.notes.map((note, i) => (
                        <div key={i} className="alert-box" style={{
                          borderColor: rc, background: `${rc}0d`, color: 'var(--text-secondary)',
                        }}>
                          • {note}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Event logged confirmation */}
                  <div className="glass-card" style={{ borderLeft: '3px solid var(--green)' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ fontSize: 28 }}>✅</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--green)', marginBottom: 4 }}>
                          Event Logged Successfully
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                          Event ID: <span style={{ color: 'var(--purple)', fontWeight: 700, fontFamily: 'monospace' }}>{result.event.id}</span><br />
                          Logged at: {result.event.time} · Zone: {result.event.zone}<br />
                          This event has been added to the live feed below.
                        </div>
                      </div>
                    </div>
                    <div style={{
                      marginTop: 14, padding: '10px 14px',
                      background: 'rgba(39,174,96,0.06)', borderRadius: 8,
                      border: '1px solid rgba(39,174,96,0.15)',
                      fontSize: 11, color: 'rgba(93,202,138,0.8)', lineHeight: 1.6,
                    }}>
                      🧠 <strong>Post-event learning:</strong> Once this event is resolved, it will be added to the training pool. The next model retrain will incorporate this event, improving future predictions for similar situations.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="glass-card" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 56, marginBottom: 14 }}>📍</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                    {modelReady ? 'Live Impact Preview' : 'AI engine warming up…'}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                    Fill in the event details and submit to see:<br/>
                    Risk Level · Expected Congestion · Affected Radius<br/>
                    Personnel Required · Deployment Plan
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Live Event Feed ── */}
          {liveEvents.length > 0 && (
            <div className="glass-card fade-up" style={{ marginTop: 32, overflowX: 'auto' }}>
              <div className="section-title" style={{ marginBottom: 16 }}>
                🔴 Live Event Feed — {liveEvents.length} event{liveEvents.length > 1 ? 's' : ''} logged this session
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Event ID</th>
                    <th>Type</th>
                    <th>Cause</th>
                    <th>Zone</th>
                    <th>AI Risk Score</th>
                    <th>Logged At</th>
                  </tr>
                </thead>
                <tbody>
                  {liveEvents.map((ev, i) => <LiveEventRow key={ev.id} ev={ev} index={i} />)}
                </tbody>
              </table>
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
                🧠 These events feed into the post-event learning pipeline · Session-local storage
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
