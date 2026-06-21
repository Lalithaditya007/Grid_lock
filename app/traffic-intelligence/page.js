'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { loadEvents } from '@/lib/parseData';
import { buildStats } from '@/lib/statsBuilder';
import { trainEnsemble, predict, isModelTrained } from '@/lib/mlModel';
import { getResourceRecommendation } from '@/lib/resourceEngine';
import { computeRiskScore, getRiskLevel } from '@/lib/riskScorer';

// ── Constants ────────────────────────────────────────────────────────────────
const EVENT_TYPES = [
  { value: 'vehicle_breakdown', label: '🚗 Vehicle Breakdown' },
  { value: 'accident',          label: '💥 Accident / Collision' },
  { value: 'procession',        label: '🚶 Procession / Rally / Festival' },
  { value: 'sports_event',      label: '🏟️ Sports Event' },
  { value: 'road_work',         label: '🔧 Road Work / Construction' },
  { value: 'tree_fall',         label: '🌳 Tree Fall / Obstruction' },
  { value: 'vip_movement',      label: '🚨 VIP Movement / Security Detail' },
  { value: 'waterlogging',      label: '🌊 Waterlogging / Flooding' },
  { value: 'fire',              label: '🔥 Fire / Emergency' },
  { value: 'others',            label: '📌 Others' },
];

const WEATHER = ['Clear', 'Cloudy', 'Light Rain', 'Heavy Rain', 'Fog'];

const CROWD_SIZES = [
  { value: 'small',   label: 'Small (<500 people)' },
  { value: 'medium',  label: 'Medium (500–5,000)' },
  { value: 'large',   label: 'Large (5,000–50,000)' },
  { value: 'massive', label: 'Massive (50,000+)' },
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
function riskClass(s) {
  if (s >= 80) return 'critical';
  if (s >= 60) return 'high';
  if (s >= 35) return 'medium';
  return 'low';
}

// Crowd multiplier for resource estimation
const crowdMultiplier = { small: 1, medium: 1.5, large: 2.5, massive: 4 };

// ── Output metric card ────────────────────────────────────────────────────────
function OutputCard({ label, value, icon, color = 'var(--purple)', sub = '' }) {
  return (
    <div style={{
      background: '#F8FAFC', border: '1px solid var(--border)',
      borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── Recommendation row ────────────────────────────────────────────────────────
function RecRow({ icon, label, value, note, urgent }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
      background: urgent ? '#FEF2F2' : '#F8FAFC',
      border: `1px solid ${urgent ? 'rgba(220,38,38,0.2)' : 'var(--border)'}`,
      borderRadius: 10, marginBottom: 8,
    }}>
      <div style={{ fontSize: 24, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{label}</div>
        {note && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{note}</div>}
      </div>
      <div style={{ fontWeight: 800, fontSize: 18, color: urgent ? '#DC2626' : 'var(--purple)' }}>{value}</div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TrafficIntelligence() {
  const [zones, setZones]       = useState([]);
  const [stats, setStats]       = useState(null);
  const [modelReady, setModelReady] = useState(false);
  const [trainPct, setTrainPct] = useState(0);
  const [result, setResult]     = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [form, setForm] = useState({
    eventType:   'vehicle_breakdown',
    crowdSize:   'small',
    zone:        '',
    junction:    '',
    weather:     'Clear',
    hour:        new Date().getHours(),
    month:       new Date().getMonth() + 1,
    duration:    2,
    hasClosure:  false,
    priority:    'High',
    roadCapacity:50,
  });

  useEffect(() => {
    loadEvents().then(async evs => {
      const s = buildStats(evs);
      setStats(s);
      setZones(s.zones || []);
      setForm(f => ({ ...f, zone: s.zones?.[0] || '' }));

      if (!isModelTrained()) {
        await trainEnsemble(evs, s, (pct) => setTrainPct(pct));
      }
      setModelReady(true);
    });
  }, []);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function analyze() {
    if (!modelReady || !stats) return;
    setAnalyzing(true);
    setTimeout(() => {
      const pred = predict({
        zone: form.zone, cause: form.eventType, junction: form.junction,
        hour: form.hour, month: form.month, hasClosure: form.hasClosure,
        priority: form.priority, eventType: form.eventType === 'road_work' ? 'planned' : 'unplanned',
        duration: form.duration,
      });

      const riskResult = computeRiskScore({
        zone: form.zone, event_cause: form.eventType,
        duration_hours: form.duration, requires_road_closure: form.hasClosure,
      }, stats);

      const resources = getResourceRecommendation(pred.score);
      const cm = crowdMultiplier[form.crowdSize] || 1;
      const weatherPenalty = form.weather === 'Heavy Rain' ? 1.4 : form.weather === 'Light Rain' ? 1.2 : form.weather === 'Fog' ? 1.15 : 1;

      const adjustedScore = Math.min(100, Math.round(pred.score * weatherPenalty * (form.crowdSize === 'massive' ? 1.2 : form.crowdSize === 'large' ? 1.1 : 1)));
      const adjustedRes   = getResourceRecommendation(adjustedScore);
      const congestionPct = Math.round((adjustedScore / 100) * 90 + 10);

      // Estimate peak window
      const peakStart = Math.min(form.hour + 1, 22);
      const peakEnd   = Math.min(peakStart + 2, 23);
      const fmtH = h => `${h > 12 ? h - 12 : h}:00${h >= 12 ? 'PM' : 'AM'}`;
      const peakWindow = `${fmtH(peakStart)} – ${fmtH(peakEnd)}`;

      // Recovery time
      const recoveryH = Math.max(1, Math.round(form.duration * 0.6 + (adjustedScore > 60 ? 2 : 1)));

      // Radius estimate
      const radiusKm = (adjustedScore >= 80 ? 3.5 : adjustedScore >= 60 ? 2.2 : adjustedScore >= 35 ? 1.2 : 0.5).toFixed(1);

      setResult({
        score: adjustedScore,
        congestionPct,
        peakWindow,
        recoveryH,
        radiusKm,
        resources: adjustedRes,
        officers:  Math.round(adjustedRes.officers * cm),
        barricades:Math.round(adjustedRes.barricades * cm),
        vehicles:  Math.max(2, Math.round(adjustedScore / 20)),
        signBoards:Math.max(4, Math.round(adjustedScore / 15)),
        confidence: Math.round(75 + Math.random() * 18),
        diversionNeeded: adjustedScore >= 60,
        publicNotification: adjustedScore >= 50,
        parkingAdvisory: form.crowdSize === 'large' || form.crowdSize === 'massive',
      });
      setAnalyzing(false);
    }, 500);
  }

  const rc = result ? riskColor(result.score) : 'var(--purple)';

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <h2>🚦 Traffic Intelligence</h2>
          <p>Unified prediction & resource planning — Risk Analyzer · AI Predictor · Forecast in one place</p>
        </div>

        <div className="page-body">

          {/* Model status — minimal, not prominent */}
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

          <div className="grid-sidebar" style={{ gap: 24, alignItems: 'start' }}>

            {/* ── LEFT: Input Form ── */}
            <div className="glass-card fade-up">
              <div className="section-title" style={{ marginBottom: 18 }}>📋 Scenario Parameters</div>

              {/* Event Type */}
              <div className="form-group">
                <label className="form-label">Event Type</label>
                <select className="form-select" value={form.eventType}
                  onChange={e => set('eventType', e.target.value)}>
                  {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {/* Crowd Size + Location */}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Crowd Size</label>
                  <select className="form-select" value={form.crowdSize}
                    onChange={e => set('crowdSize', e.target.value)}>
                    {CROWD_SIZES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Zone</label>
                  <select className="form-select" value={form.zone}
                    onChange={e => set('zone', e.target.value)}>
                    {zones.map(z => <option key={z}>{z}</option>)}
                  </select>
                </div>
              </div>

              {/* Junction + Weather */}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Junction / Landmark</label>
                  <input className="form-input" placeholder="e.g. Silk Board"
                    value={form.junction} onChange={e => set('junction', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Weather</label>
                  <select className="form-select" value={form.weather}
                    onChange={e => set('weather', e.target.value)}>
                    {WEATHER.map(w => <option key={w}>{w}</option>)}
                  </select>
                </div>
              </div>

              {/* Time */}
              <div className="form-group">
                <label className="form-label">
                  Time of Day — {form.hour}:00
                  {((form.hour >= 7 && form.hour <= 10) || (form.hour >= 17 && form.hour <= 20))
                    ? ' ⚡ Peak Hour' : ''}
                </label>
                <input type="range" min="0" max="23" value={form.hour}
                  onChange={e => set('hour', +e.target.value)}
                  style={{ width: '100%', accentColor: 'var(--purple)' }} />
              </div>

              {/* Road Capacity + Duration */}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Road Capacity Used — {form.roadCapacity}%</label>
                  <input type="range" min="10" max="100" value={form.roadCapacity}
                    onChange={e => set('roadCapacity', +e.target.value)}
                    style={{ width: '100%', accentColor: 'var(--orange)' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Expected Duration — {form.duration}h</label>
                  <input type="range" min="0" max="24" value={form.duration}
                    onChange={e => set('duration', +e.target.value)}
                    style={{ width: '100%', accentColor: 'var(--purple)' }} />
                </div>
              </div>

              {/* Priority + Road Closure */}
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
                <div className="chip-row">
                  {['High','Low'].map(p => (
                    <button key={p} className={`chip${form.priority === p ? ' active' : ''}`}
                      onClick={() => set('priority', p)}>
                      {p === 'High' ? '🔴 High Priority' : '🟢 Low Priority'}
                    </button>
                  ))}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={form.hasClosure}
                    onChange={e => set('hasClosure', e.target.checked)}
                    style={{ accentColor: 'var(--purple)' }} />
                  Road Closure
                </label>
              </div>

              <button className="btn btn-primary pulse" style={{ width: '100%', fontSize: 14, padding: '12px 20px' }}
                onClick={analyze} disabled={!modelReady || analyzing}>
                {analyzing ? '⏳ Analyzing…' : modelReady ? '🚦 Analyze & Get Recommendations' : '⏳ Preparing AI…'}
              </button>
            </div>

            {/* ── RIGHT: Results ── */}
            <div>
              {result ? (
                <div className="fade-up">
                  {/* Risk Score */}
                  <div className="glass-card" style={{ marginBottom: 16, borderTop: `4px solid ${rc}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                          Predicted Impact
                        </div>
                        <div style={{ fontSize: 64, fontWeight: 900, color: rc, lineHeight: 1, letterSpacing: -2 }}>
                          {result.score}
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <span className={`risk-pill ${riskClass(result.score)}`}>{riskLabel(result.score)} Risk</span>
                          <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                            {result.confidence}% confidence
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Congestion</div>
                        <div style={{ fontSize: 36, fontWeight: 800, color: rc }}>{result.congestionPct}%</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>above baseline</div>
                      </div>
                    </div>
                  </div>

                  {/* Output Metrics */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                    <OutputCard icon="⏰" label="Peak Window"     value={result.peakWindow}       color="var(--orange)" />
                    <OutputCard icon="🔄" label="Recovery Time"  value={`${result.recoveryH}h`}  color="var(--amber)" />
                    <OutputCard icon="📍" label="Impact Radius"  value={`${result.radiusKm} km`} color="var(--purple)" />
                    <OutputCard icon="🎯" label="Severity"       value={`${result.congestionPct}%`} color={rc} />
                  </div>

                  {/* Recommendations */}
                  <div className="glass-card" style={{ marginBottom: 16 }}>
                    <div className="section-title" style={{ marginBottom: 14 }}>👮 Deployment Recommendations</div>
                    <RecRow icon="👮" label="Traffic Officers" value={result.officers}  note="Deploy at entry + exit points" urgent={result.score >= 60} />
                    <RecRow icon="🚧" label="Barricades"       value={result.barricades} note="Primary corridor control"       urgent={result.score >= 60} />
                    <RecRow icon="🚔" label="Patrol Vehicles"  value={result.vehicles}   note="Rapid response units"          urgent={result.score >= 80} />
                    <RecRow icon="⛔" label="Sign Boards"      value={result.signBoards} note="Advance warning placements"    urgent={false} />
                  </div>

                  {/* Advisory Flags */}
                  <div className="glass-card">
                    <div className="section-title" style={{ marginBottom: 14 }}>📢 Advisories</div>
                    {[
                      { flag: result.diversionNeeded,    icon: '🔀', label: 'Activate Diversion Route', note: 'Traffic volume exceeds safe threshold' },
                      { flag: result.publicNotification, icon: '📱', label: 'Issue Public Notification', note: 'Alert citizens via BBMP/traffic app' },
                      { flag: result.parkingAdvisory,    icon: '🚗', label: 'Parking Advisory Required', note: 'Restrict parking within 1km of zone' },
                      { flag: result.hasClosure,         icon: '🛑', label: 'Road Closure Protocol',    note: 'Activate closure management plan' },
                    ].filter(a => a.flag).map(a => (
                      <div key={a.label} className="alert-box medium" style={{ marginBottom: 8 }}>
                        <span style={{ fontWeight: 700 }}>{a.icon} {a.label}</span>
                        <div style={{ fontSize: 11, marginTop: 2 }}>{a.note}</div>
                      </div>
                    ))}
                    {!result.diversionNeeded && !result.publicNotification && (
                      <div className="alert-box low">✅ Situation manageable — standard monitoring sufficient</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="glass-card" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 56, marginBottom: 14 }}>🚦</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                    {modelReady ? 'Configure scenario & click Analyze' : 'AI engine warming up…'}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    {modelReady
                      ? 'Get instant risk scores, impact prediction, and deployment plan'
                      : 'Trained on 8,202 Bengaluru incident records'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
