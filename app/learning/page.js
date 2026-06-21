'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { getResolvedPool, clearResolvedPool } from '@/lib/liveEventStore';
import { loadEvents } from '@/lib/parseData';
import { buildStats } from '@/lib/statsBuilder';
import { trainEnsemble, getEnsembleState } from '@/lib/mlModel';

function riskColor(s) {
  if (s >= 80) return '#EF5350';
  if (s >= 60) return '#FF6D00';
  if (s >= 35) return '#FFB300';
  return '#27AE60';
}
function riskLabel(s) {
  if (s >= 80) return 'CRITICAL';
  if (s >= 60) return 'HIGH';
  if (s >= 35) return 'MEDIUM';
  return 'LOW';
}

// ── Mini metric card ─────────────────────────────────────────────────────────
function Metric({ label, value, unit = '', color = 'var(--purple)', sub = '' }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: `1px solid var(--border)`,
      borderRadius: 12, padding: '16px 20px', borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color, letterSpacing: -1, lineHeight: 1 }}>
        {value}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 3 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Pipeline step ────────────────────────────────────────────────────────────
function PipeStep({ num, label, desc, done, active }) {
  return (
    <div style={{
      display: 'flex', gap: 16, alignItems: 'flex-start',
      opacity: done || active ? 1 : 0.45,
      transition: 'opacity 0.3s',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 14,
        background: done ? 'var(--green)' : active ? 'var(--purple)' : 'rgba(41,121,255,0.1)',
        color: done || active ? '#fff' : 'var(--text-muted)',
        border: active ? '2px solid var(--purple)' : 'none',
        boxShadow: active ? '0 0 14px rgba(41,121,255,0.4)' : 'none',
        transition: 'all 0.4s',
      }}>
        {done ? '✓' : num}
      </div>
      <div style={{ paddingTop: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: done ? '#5dca8a' : active ? '#6aaeff' : 'var(--text-secondary)' }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LearningPage() {
  const [pool, setPool]           = useState([]);
  const [baseMetrics, setBase]    = useState(null);   // before retrain
  const [newMetrics, setNew]      = useState(null);    // after retrain
  const [retraining, setRetraining] = useState(false);
  const [retrained, setRetrained]   = useState(false);
  const [trainPct, setTrainPct]     = useState(0);
  const [trainMsg, setTrainMsg]     = useState('');
  const [step, setStep]             = useState(0);    // pipeline progress 0-4

  useEffect(() => {
    setPool(getResolvedPool());
    // Grab existing model metrics if already trained
    const st = getEnsembleState();
    if (st) setBase(st.ensembleMetrics);
  }, []);

  async function handleRetrain() {
    if (retraining || pool.length === 0) return;
    setRetraining(true);
    setStep(1);

    // Step 1: Load base events
    const baseEvs = await loadEvents();
    setStep(2);

    // Step 2: Merge resolved events into training data
    const merged = [
      ...baseEvs,
      ...pool.map(ev => ({
        id:                   ev.id,
        event_type:           ev.event_type,
        event_cause:          ev.cause,
        latitude:             0,
        longitude:            0,
        address:              '',
        start_datetime:       new Date(ev.loggedAt),
        end_datetime:         new Date(ev.resolvedAt),
        duration_hours:       ev.actualDurationHours,
        requires_road_closure: ev.hasClosure || false,
        priority:             ev.priority,
        zone:                 ev.zone,
        junction:             ev.junction || '',
        status:               'resolved',
        direction:            '',
        corridor:             '',
        police_station:       '',
      })),
    ];
    setStep(3);

    // Step 3: Retrain
    const stats = buildStats(merged);
    const result = await trainEnsemble(merged, stats, (pct, msg) => {
      setTrainPct(pct);
      setTrainMsg(msg);
    });

    setStep(4);
    if (result) setNew(result.ensembleMetrics);
    setRetrained(true);
    setRetraining(false);
  }

  function handleClearPool() {
    clearResolvedPool();
    setPool([]);
    setRetrained(false);
    setNew(null);
    setStep(0);
  }

  const hasDelta = baseMetrics && newMetrics;
  const r2Delta  = hasDelta ? +(newMetrics.r2  - baseMetrics.r2).toFixed(4)  : null;
  const maeDelta = hasDelta ? +(baseMetrics.mae - newMetrics.mae).toFixed(2)  : null;  // lower is better
  const accDelta = hasDelta ? +(newMetrics.acc10 - baseMetrics.acc10).toFixed(1) : null;

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="main-content">
        {/* ── Header ── */}
        <div className="page-header">
          <h2>🧠 Post-Event Learning Pipeline</h2>
          <p>Resolved events feed back into the model · Close the prediction feedback loop · Improve future accuracy</p>
        </div>

        <div className="page-body" style={{ paddingBottom: 60 }}>

          {/* ── Problem statement callout ── */}
          <div className="glass-card fade-up" style={{
            marginBottom: 24,
            borderLeft: '3px solid var(--amber)',
            background: 'linear-gradient(135deg, rgba(255,179,0,0.06), rgba(41,121,255,0.04))',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              ⚠️ Problem Statement — Gap Being Addressed
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              {[
                { icon: '📊', problem: 'Event impact not quantified in advance', solution: 'AI Impact Score on log' },
                { icon: '🧑‍💼', problem: 'Resource deployment is experience-driven', solution: 'Data-driven resource plan' },
                { icon: '🔄', problem: 'No post-event learning system', solution: 'This page — feedback loop' },
              ].map((item, i) => (
                <div key={i} style={{ padding: '12px 14px', background: 'rgba(41,121,255,0.05)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{item.icon}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.4 }}>{item.problem}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>✓ {item.solution}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Two-column layout ── */}
          <div className="grid-sidebar" style={{ gap: 24, alignItems: 'start' }}>

            {/* ── LEFT: Pipeline steps + control ── */}
            <div>
              {/* Pipeline steps */}
              <div className="glass-card fade-up" style={{ marginBottom: 20 }}>
                <div className="section-title" style={{ marginBottom: 20 }}>🔄 Learning Pipeline</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <PipeStep num={1} label="Resolve Events"
                    desc="Mark live events as resolved after they end"
                    done={step >= 1 || pool.length > 0} active={step === 0 && pool.length === 0} />

                  <div style={{ marginLeft: 18, width: 2, height: 20, background: 'var(--border)' }} />

                  <PipeStep num={2} label="Build Training Set"
                    desc={`Merge ${pool.length} resolved events with 8,202 historical records`}
                    done={step >= 2} active={step === 1} />

                  <div style={{ marginLeft: 18, width: 2, height: 20, background: 'var(--border)' }} />

                  <PipeStep num={3} label="Retrain Ensemble"
                    desc="3-model neural network retrains on the enriched dataset"
                    done={step >= 3} active={step === 2 || step === 3} />

                  <div style={{ marginLeft: 18, width: 2, height: 20, background: 'var(--border)' }} />

                  <PipeStep num={4} label="Deploy Updated Model"
                    desc="New model weights take effect for all future predictions"
                    done={step >= 4} active={step === 4} />
                </div>

                {/* Progress bar during training */}
                {retraining && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                      <span>{trainMsg || 'Starting…'}</span>
                      <span style={{ color: 'var(--purple)' }}>{trainPct}%</span>
                    </div>
                    <div className="progress-bar-track" style={{ height: 6 }}>
                      <div className="progress-bar-fill" style={{
                        width: `${trainPct}%`,
                        background: 'linear-gradient(90deg,#2979FF,#27AE60)',
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <Metric label="Events in Pool" value={pool.length}
                  color={pool.length > 0 ? 'var(--green)' : 'var(--text-muted)'}
                  sub="Resolved & ready to train" />
                <Metric label="Base Dataset" value="8,202"
                  color="var(--purple)" sub="Historical ASTRAM records" />
              </div>

              {/* CTA Buttons */}
              {pool.length === 0 ? (
                <div style={{
                  padding: '20px', borderRadius: 12, textAlign: 'center',
                  border: '1px dashed rgba(41,121,255,0.25)',
                  background: 'rgba(41,121,255,0.03)',
                }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                    No resolved events yet
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                    Log events, then mark them resolved in the Event Table
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <Link href="/log-event" className="btn btn-primary" style={{ fontSize: 12, padding: '8px 18px' }}>
                      ➕ Log Event
                    </Link>
                    <Link href="/events" className="btn btn-ghost" style={{ fontSize: 12, padding: '8px 18px' }}>
                      📋 Event Table
                    </Link>
                  </div>
                </div>
              ) : retrained ? (
                <div>
                  <div style={{
                    padding: '14px 18px', borderRadius: 12, marginBottom: 12,
                    background: 'rgba(39,174,96,0.10)', border: '1px solid rgba(39,174,96,0.3)',
                    fontWeight: 700, fontSize: 14, color: '#5dca8a',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <span>✅</span> Model retrained — new weights active for all predictions
                  </div>
                  <button className="btn btn-ghost" style={{ width: '100%', fontSize: 13 }}
                    onClick={handleClearPool}>
                    🗑 Clear learning pool & reset
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <button
                    className="btn btn-primary pulse"
                    style={{ width: '100%', fontSize: 14, padding: '14px 20px' }}
                    onClick={handleRetrain}
                    disabled={retraining}>
                    {retraining
                      ? `⏳ Retraining… ${trainPct}%`
                      : `🧠 Retrain Model with ${pool.length} New Event${pool.length > 1 ? 's' : ''}`}
                  </button>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                    Will merge {pool.length} resolved event{pool.length > 1 ? 's' : ''} with 8,202 historical records and retrain all 3 neural networks
                  </div>
                  <button className="btn btn-ghost" style={{ width: '100%', fontSize: 12 }}
                    onClick={handleClearPool}>
                    🗑 Clear pool without retraining
                  </button>
                </div>
              )}
            </div>

            {/* ── RIGHT: Metrics comparison + pool table ── */}
            <div>
              {/* Before / After metrics */}
              {baseMetrics && (
                <div className="glass-card fade-up" style={{ marginBottom: 20 }}>
                  <div className="section-title" style={{ marginBottom: 16 }}>
                    📊 Model Metrics {retrained ? '— Before vs After' : '— Current'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: retrained ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 16 }}>
                    {/* Before */}
                    <div>
                      {retrained && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                          Before Retrain
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[
                          { label: 'R² Score', val: baseMetrics.r2, color: baseMetrics.r2 >= 0.7 ? 'var(--green)' : 'var(--amber)' },
                          { label: 'MAE', val: `${baseMetrics.mae} pts`, color: 'var(--purple)' },
                          { label: 'Acc ±10 pts', val: `${baseMetrics.acc10}%`, color: 'var(--green)' },
                        ].map(m => (
                          <div key={m.label} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '10px 14px', background: 'rgba(41,121,255,0.05)',
                            borderRadius: 8, border: '1px solid var(--border)',
                          }}>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.label}</span>
                            <span style={{ fontWeight: 700, color: m.color }}>{m.val}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* After */}
                    {retrained && newMetrics && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#5dca8a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                          After Retrain ✨
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {[
                            { label: 'R² Score',   val: newMetrics.r2,       delta: r2Delta,  higherBetter: true,  color: newMetrics.r2 >= 0.7 ? 'var(--green)' : 'var(--amber)' },
                            { label: 'MAE',        val: `${newMetrics.mae} pts`, delta: maeDelta, higherBetter: true,  color: 'var(--purple)' },
                            { label: 'Acc ±10 pts',val: `${newMetrics.acc10}%`,  delta: accDelta, higherBetter: true,  color: 'var(--green)' },
                          ].map(m => (
                            <div key={m.label} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '10px 14px',
                              background: 'rgba(39,174,96,0.07)',
                              borderRadius: 8, border: '1px solid rgba(39,174,96,0.2)',
                            }}>
                              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.label}</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 700, color: m.color }}>{m.val}</span>
                                {m.delta != null && m.delta !== 0 && (
                                  <span style={{
                                    fontSize: 10, fontWeight: 700,
                                    color: (m.delta > 0) === m.higherBetter ? '#5dca8a' : '#ff7875',
                                  }}>
                                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                                  </span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {retrained && (
                    <div style={{
                      padding: '12px 14px', borderRadius: 8,
                      background: 'rgba(39,174,96,0.07)', border: '1px solid rgba(39,174,96,0.2)',
                      fontSize: 12, color: '#5dca8a', lineHeight: 1.6,
                    }}>
                      🎯 Model retrained on <strong>{8202 + pool.length}</strong> events (+{pool.length} new). Future predictions on the AI Predict and Log Event pages now use the updated weights.
                    </div>
                  )}
                </div>
              )}

              {/* Resolved events table */}
              {pool.length > 0 && (
                <div className="glass-card fade-up" style={{ overflowX: 'auto' }}>
                  <div className="section-title" style={{ marginBottom: 16 }}>
                    📥 Learning Pool — {pool.length} resolved event{pool.length > 1 ? 's' : ''}
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Type</th>
                        <th>Cause</th>
                        <th>Zone</th>
                        <th>AI Score</th>
                        <th>Actual Duration</th>
                        <th>Resolved At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pool.map((ev, i) => {
                        const rc = riskColor(ev.score);
                        return (
                          <tr key={ev.id} style={{ animation: 'fadeUp 0.4s ease both', animationDelay: `${i * 50}ms` }}>
                            <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--purple)' }}>{ev.id}</td>
                            <td>
                              <span className={`badge badge-${ev.event_type === 'planned' ? 'purple' : 'orange'}`}>
                                {ev.event_type}
                              </span>
                            </td>
                            <td>{(ev.cause || '').replace(/_/g, ' ')}</td>
                            <td style={{ fontSize: 12 }}>{ev.zone}</td>
                            <td>
                              <span style={{
                                padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                background: `${rc}22`, color: rc, border: `1px solid ${rc}40`,
                              }}>
                                {riskLabel(ev.score)} · {ev.score}
                              </span>
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              {ev.actualDurationHours < 0.1
                                ? `${Math.round(ev.actualDurationHours * 60)}m`
                                : `${ev.actualDurationHours.toFixed(2)}h`}
                            </td>
                            <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {new Date(ev.resolvedAt).toLocaleString('en-IN', {
                                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                              })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{
                    padding: '10px 16px', borderTop: '1px solid var(--border)',
                    fontSize: 11, color: 'var(--text-muted)',
                  }}>
                    🧠 These events will be merged with the 8,202-record ASTRAM dataset for retraining
                  </div>
                </div>
              )}

              {/* Empty state */}
              {pool.length === 0 && !baseMetrics && (
                <div className="glass-card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 60, marginBottom: 14 }}>🔄</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                    Learning pipeline waiting
                  </div>
                  <div style={{ fontSize: 13 }}>
                    Log an event → resolve it → retrain here
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
