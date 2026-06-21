'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { loadEvents } from '@/lib/parseData';
import { buildStats } from '@/lib/statsBuilder';
import { computeRiskScore, getRiskLevel } from '@/lib/riskScorer';

export default function RiskAnalyzer() {
  const [stats, setStats] = useState(null);
  const [zones, setZones] = useState([]);
  const [causes, setCauses] = useState([]);
  const [form, setForm] = useState({
    zone: '', event_cause: '', duration_hours: '2',
    requires_road_closure: false, priority: 'High',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents().then(evs => {
      const s = buildStats(evs);
      setStats(s);
      setZones(s.zones);
      setCauses(s.causes);
      setForm(f => ({ ...f, zone: s.zones[0] || '', event_cause: s.causes[0] || '' }));
      setLoading(false);
    });
  }, []);

  function analyze() {
    if (!stats) return;
    const event = {
      zone: form.zone,
      event_cause: form.event_cause,
      duration_hours: parseFloat(form.duration_hours) || 0,
      requires_road_closure: form.requires_road_closure,
    };
    setResult(computeRiskScore(event, stats));
  }

  const level = result ? getRiskLevel(result.score) : null;

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <h2>⚡ Data-Driven Risk Analyzer</h2>
          <p>Every score component is derived from historical incident patterns — not hand-crafted weights</p>
        </div>
        <div className="page-body">
          {loading ? <div className="loading-wrap"><div className="spinner"/><span>Loading dataset…</span></div> : (
          <div className="grid-sidebar">
            {/* Form */}
            <div>
              <div className="glass-card fade-up">
                <div className="section-title">Event Parameters</div>

                <div className="form-group">
                  <label className="form-label">Zone</label>
                  <select className="form-select" value={form.zone}
                    onChange={e => setForm({...form, zone: e.target.value})}>
                    {zones.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Event Cause</label>
                  <select className="form-select" value={form.event_cause}
                    onChange={e => setForm({...form, event_cause: e.target.value})}>
                    {causes.map(c => <option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Expected Duration (hours)</label>
                  <input type="number" className="form-input" min="0" max="72"
                    value={form.duration_hours}
                    onChange={e => setForm({...form, duration_hours: e.target.value})} />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
                    <input type="checkbox" checked={form.requires_road_closure}
                      onChange={e => setForm({...form, requires_road_closure: e.target.checked})}
                      style={{width:16,height:16,accentColor:'var(--purple)'}} />
                    Requires Road Closure
                  </label>
                </div>

                <button className="btn btn-primary" style={{width:'100%'}} onClick={analyze}>
                  ⚡ Analyze Risk
                </button>
              </div>

              {/* Methodology */}
              <div className="glass-card" style={{marginTop:16}}>
                <div className="section-title">Scoring Methodology</div>
                <div style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.8}}>
                  {[
                    ['Cause Recurrence (30 pts)', 'How frequently this cause type appears in historical data'],
                    ['Zone Frequency (25 pts)', 'Relative incident density in the selected zone'],
                    ['Zone Closure Rate (25 pts)', 'Historical road closure probability for this zone'],
                    ['Duration Factor (20 pts)', 'Scaled against maximum observed event duration'],
                  ].map(([t,d]) => (
                    <div key={t} style={{marginBottom:12}}>
                      <div style={{fontWeight:600,color:'var(--purple)',marginBottom:2}}>{t}</div>
                      <div>{d}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Result */}
            <div>
              {result ? (
                <div className="fade-up">
                  {/* Score */}
                  <div className="glass-card" style={{textAlign:'center',marginBottom:20,padding:36,
                    border:`1px solid ${level.color}33`}}>
                    <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',
                      textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>
                      Risk Score
                    </div>
                    <div className="score-number" style={{color:level.color}}>{result.score}</div>
                    <div className="score-level" style={{
                      background:`${level.color}22`, color:level.color, marginTop:12}}>
                      {level.label} Risk
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="glass-card" style={{marginBottom:20}}>
                    <div className="section-title">Score Breakdown</div>
                    {Object.entries(result.breakdown).map(([key, val]) => {
                      const labels = {
                        causeRecurrence: 'Cause Recurrence',
                        zoneFrequency: 'Zone Frequency',
                        zoneClosureRate: 'Zone Closure Rate',
                        durationFactor: 'Duration Factor',
                      };
                      const maxes = { causeRecurrence: 30, zoneFrequency: 25, zoneClosureRate: 25, durationFactor: 20 };
                      return (
                        <div key={key} className="progress-bar-wrap">
                          <div className="progress-bar-label">
                            <span>{labels[key]}</span>
                            <span style={{fontWeight:700,color:'var(--purple)'}}>{val}/{maxes[key]}</span>
                          </div>
                          <div className="progress-bar-track">
                            <div className="progress-bar-fill"
                              style={{width:`${(val/maxes[key])*100}%`,
                                background:'linear-gradient(90deg,#2979FF,#27AE60)'}}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Data Justification */}
                  <div className="glass-card">
                    <div className="section-title">📊 Data Justification</div>
                    {Object.values(result.labels).map((note, i) => (
                      <div key={i} className="alert-box low" style={{marginBottom:8}}>{note}</div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="glass-card" style={{textAlign:'center',padding:60,color:'var(--text-muted)'}}>
                  <div style={{fontSize:48,marginBottom:12}}>⚡</div>
                  <div style={{fontSize:15}}>Select parameters and click<br/>&#34;Analyze Risk&#34; to get a score</div>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

