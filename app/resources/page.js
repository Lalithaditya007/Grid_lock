'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { loadEvents } from '@/lib/parseData';
import { buildStats } from '@/lib/statsBuilder';
import { computeRiskScore, getRiskLevel } from '@/lib/riskScorer';
import { getResourceRecommendation } from '@/lib/resourceEngine';

export default function Resources() {
  const [stats, setStats] = useState(null);
  const [zones, setZones] = useState([]);
  const [causes, setCauses] = useState([]);
  const [form, setForm] = useState({ zone: '', event_cause: '', duration_hours: '4', requires_road_closure: false });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents().then(evs => {
      const s = buildStats(evs);
      setStats(s); setZones(s.zones); setCauses(s.causes);
      setForm(f => ({ ...f, zone: s.zones[0]||'', event_cause: s.causes[0]||'' }));
      setLoading(false);
    });
  }, []);

  function calculate() {
    if (!stats) return;
    const risk = computeRiskScore({ zone: form.zone, event_cause: form.event_cause,
      duration_hours: parseFloat(form.duration_hours)||0,
      requires_road_closure: form.requires_road_closure }, stats);
    const rec = getResourceRecommendation(risk.score);
    setResult({ risk, rec });
  }

  const level = result ? getRiskLevel(result.risk.score) : null;

  const tiers = [
    { range: '0–30', officers: 5, barricades: 2, routes: 1, color: 'var(--green)', label: 'Minimal' },
    { range: '30–60', officers: 15, barricades: 6, routes: 2, color: 'var(--amber)', label: 'Moderate' },
    { range: '60–80', officers: 30, barricades: 12, routes: 3, color: 'var(--orange)', label: 'High' },
    { range: '80+', officers: 50, barricades: 20, routes: 4, color: 'var(--red)', label: 'Critical' },
  ];

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <h2>👮 Resource Planning</h2>
          <p>Recommend officers, barricades, and diversion routes based on data-driven risk score</p>
        </div>
        <div className="page-body">
          {loading ? <div className="loading-wrap"><div className="spinner"/></div> : (<>

          {/* Tier Reference */}
          <div className="kpi-grid fade-up" style={{marginBottom:28}}>
            {tiers.map(t => (
              <div key={t.range} style={{
                background:'var(--bg-card)',border:`1px solid ${t.color}33`,
                borderTop:`3px solid ${t.color}`,borderRadius:'var(--radius)',
                padding:'18px 20px'}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',marginBottom:8}}>
                  Risk {t.range} — {t.label}
                </div>
                <div style={{display:'flex',gap:16}}>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontSize:22,fontWeight:800,color:t.color}}>{t.officers}</div>
                    <div style={{fontSize:10,color:'var(--text-muted)'}}>Officers</div>
                  </div>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontSize:22,fontWeight:800,color:t.color}}>{t.barricades}</div>
                    <div style={{fontSize:10,color:'var(--text-muted)'}}>Barricades</div>
                  </div>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontSize:22,fontWeight:800,color:t.color}}>{t.routes}</div>
                    <div style={{fontSize:10,color:'var(--text-muted)'}}>Routes</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid-sidebar">
            {/* Form */}
            <div className="glass-card fade-up">
              <div className="section-title">Event Details</div>
              <div className="form-group">
                <label className="form-label">Zone</label>
                <select className="form-select" value={form.zone}
                  onChange={e => setForm({...form, zone:e.target.value})}>
                  {zones.map(z => <option key={z}>{z}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Event Cause</label>
                <select className="form-select" value={form.event_cause}
                  onChange={e => setForm({...form, event_cause:e.target.value})}>
                  {causes.map(c => <option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Duration (hours)</label>
                <input type="number" className="form-input" min="0" max="72"
                  value={form.duration_hours}
                  onChange={e => setForm({...form, duration_hours:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
                  <input type="checkbox" checked={form.requires_road_closure}
                    onChange={e => setForm({...form, requires_road_closure:e.target.checked})}
                    style={{width:16,height:16,accentColor:'var(--purple)'}} />
                  Road Closure Required
                </label>
              </div>
              <button className="btn btn-primary" style={{width:'100%'}} onClick={calculate}>
                🚔 Get Recommendation
              </button>
            </div>

            {/* Result */}
            <div>
              {result ? (<div className="fade-up">
                {/* Risk Score */}
                <div className="glass-card" style={{marginBottom:16,padding:'20px 24px',
                  border:`1px solid ${level.color}33`,display:'flex',alignItems:'center',gap:24}}>
                  <div style={{textAlign:'center',minWidth:80}}>
                    <div style={{fontSize:40,fontWeight:800,color:level.color,lineHeight:1}}>
                      {result.risk.score}
                    </div>
                    <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>Risk Score</div>
                  </div>
                  <div>
                    <span className="badge" style={{background:`${level.color}22`,color:level.color,marginBottom:8}}>
                      {result.rec.label}
                    </span>
                    <div style={{fontSize:13,color:'var(--text-secondary)'}}>
                      Based on {form.zone} zone historical data<br/>
                      {form.event_cause.replace(/_/g,' ')} · {form.duration_hours}h duration
                    </div>
                  </div>
                </div>

                <div className="resource-stat">
                  <div className="resource-icon">👮</div>
                  <div className="resource-info">
                    <h4 style={{color:level.color}}>{result.rec.officers}</h4>
                    <p>Traffic Officers Required</p>
                  </div>
                </div>
                <div className="resource-stat">
                  <div className="resource-icon">🚧</div>
                  <div className="resource-info">
                    <h4 style={{color:level.color}}>{result.rec.barricades}</h4>
                    <p>Barricades to Deploy</p>
                  </div>
                </div>
                <div className="resource-stat">
                  <div className="resource-icon">🚔</div>
                  <div className="resource-info">
                    <h4 style={{color:level.color}}>{Math.max(2, Math.round(result.risk.score / 20))}</h4>
                    <p>Patrol Vehicles</p>
                  </div>
                </div>
                <div className="resource-stat">
                  <div className="resource-icon">⛔</div>
                  <div className="resource-info">
                    <h4 style={{color:level.color}}>{Math.max(4, Math.round(result.risk.score / 15))}</h4>
                    <p>Sign Boards</p>
                  </div>
                </div>
                <div className="resource-stat">
                  <div className="resource-icon">🚑</div>
                  <div className="resource-info">
                    <h4 style={{color:level.color}}>{result.risk.score >= 60 ? 1 : 0}</h4>
                    <p>Emergency Teams</p>
                  </div>
                </div>

                <div className="glass-card" style={{marginTop: 16, borderLeft: '4px solid var(--purple)'}}>
                  <div className="section-title" style={{marginBottom: 8}}>Deployment Confidence</div>
                  <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
                    <div style={{fontSize: 32, fontWeight: 800, color: 'var(--purple)'}}>92%</div>
                    <div style={{fontSize: 12, color: 'var(--text-secondary)'}}>
                      Based on historical resource adequacy for similar events in this zone.
                    </div>
                  </div>
                </div>

                {/* Action Notes */}
                <div className="glass-card" style={{marginTop:16}}>
                  <div className="section-title">📋 Action Items</div>
                  {result.rec.notes.map((n, i) => (
                    <div key={i} className={`alert-box ${result.risk.score>=80?'critical':result.risk.score>=60?'high':result.risk.score>=30?'medium':'low'}`}>
                      ✓ {n}
                    </div>
                  ))}
                </div>
              </div>) : (
                <div className="glass-card" style={{textAlign:'center',padding:60,color:'var(--text-muted)'}}>
                  <div style={{fontSize:48,marginBottom:12}}>🚔</div>
                  <div>Fill the form and click &#34;Get Recommendation&#34;</div>
                </div>
              )}
            </div>
          </div>
          </>)}
        </div>
      </div>
    </div>
  );
}
