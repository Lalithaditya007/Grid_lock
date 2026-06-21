'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { loadEvents } from '@/lib/parseData';
import { buildStats } from '@/lib/statsBuilder';
import { computeImpactScore } from '@/lib/impactEstimator';
import { getResourceRecommendation } from '@/lib/resourceEngine';

// Chunk a large array into idle-time slices so the main thread isn't blocked
function processInIdleChunks(items, processItem, chunkSize = 200) {
  return new Promise(resolve => {
    const results = [];
    let i = 0;
    const tick = (deadline) => {
      while (i < items.length && (deadline.timeRemaining() > 1 || i === 0)) {
        results.push(processItem(items[i]));
        i++;
        if (i % chunkSize === 0) break;
      }
      if (i < items.length) {
        (window.requestIdleCallback || (fn => setTimeout(fn, 0)))(tick);
      } else {
        resolve(results);
      }
    };
    (window.requestIdleCallback || (fn => setTimeout(fn, 0)))(tick);
  });
}

export default function Impact() {
  const [rows, setRows] = useState([]);
  const [sorted, setSorted] = useState([]);
  const [sortKey, setSortKey] = useState('impact');
  const [filterType, setFilterType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    loadEvents().then(async evs => {
      const stats = buildStats(evs);
      setLoading(false);          // Show page shell immediately — don't wait for scores
      setProgress(0);

      // Score events in idle chunks — page stays responsive the whole time
      const total = evs.length;
      const computed = [];
      const CHUNK = 300;

      for (let start = 0; start < total; start += CHUNK) {
        const slice = evs.slice(start, start + CHUNK);
        await new Promise(resolve => {
          (window.requestIdleCallback || (fn => setTimeout(fn, 0)))(() => {
            slice.forEach(e => {
              const impact = computeImpactScore(e, stats);
              const rec = getResourceRecommendation(impact.score);
              computed.push({ ...e, impact: impact.score, tier: rec.label });
            });
            setProgress(Math.round(((start + CHUNK) / total) * 100));
            resolve();
          });
        });
      }

      const final = computed.sort((a,b) => b.impact - a.impact);
      setRows(final);
      setSorted(final.slice(0, 200));
      setProgress(100);
    });
  }, []);

  useEffect(() => {
    let filtered = filterType === 'all' ? rows : rows.filter(r => r.event_type === filterType);
    filtered = [...filtered].sort((a,b) => sortKey === 'impact' ? b.impact - a.impact : a.impact - b.impact);
    setSorted(filtered.slice(0, 200));
  }, [sortKey, filterType, rows]);

  function impactColor(score) {
    if (score >= 80) return 'var(--red)';
    if (score >= 60) return 'var(--orange)';
    if (score >= 30) return 'var(--amber)';
    return 'var(--green)';
  }

  const avgImpact = rows.length ? Math.round(rows.reduce((s,r)=>s+r.impact,0)/rows.length) : 0;
  const highImpact = rows.filter(r=>r.impact>=60).length;

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <h2>📊 Impact Analysis</h2>
          <p>Engineered impact scores for all events — serves as AI model training target</p>
        </div>
        <div className="page-body">

          {/* Progress bar — visible while scoring chunks, hidden when done */}
          {progress < 100 && (
            <div style={{marginBottom:16}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,
                color:'var(--text-muted)',marginBottom:6}}>
                <span>⚙️ Scoring events in background…</span>
                <span style={{color:'var(--purple)'}}>{Math.min(progress,100)}%</span>
              </div>
              <div className="progress-bar-track" style={{height:4}}>
                <div className="progress-bar-fill" style={{
                  width:`${Math.min(progress,100)}%`,
                  background:'linear-gradient(90deg,#2979FF,#27AE60)',
                  transition:'width 0.3s ease'}} />
              </div>
            </div>
          )}



          <div className="kpi-grid fade-up">
            {[
              {label:'Total Events Scored', value:rows.length, color:'purple'},
              {label:'Avg Impact Score', value:avgImpact, color:'amber'},
              {label:'High Impact Events', value:highImpact, color:'red'},
              {label:'Road Closures', value:rows.filter(r=>r.requires_road_closure).length, color:'green'},
            ].map(k => (
              <div key={k.label} className={`kpi-card ${k.color}`}>
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-value" style={{
                  color:k.color==='purple'?'var(--purple)':k.color==='amber'?'var(--amber)':k.color==='red'?'var(--red)':'var(--green)'}}>
                  {k.value}
                </div>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap'}}>
            <div className="chip-row">
              {['all','planned','unplanned'].map(f => (
                <button key={f} className={`chip${filterType===f?' active':''}`}
                  onClick={() => setFilterType(f)}>
                  {f==='all'?'All':f==='planned'?'Planned':'Unplanned'}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost" onClick={() => setSortKey(s => s==='impact'?'asc':'impact')}>
              ↕ Sort by Impact
            </button>
          </div>

          {/* Table */}
          <div className="glass-card" style={{overflowX:'auto'}}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Cause</th>
                  <th>Zone</th>
                  <th>Duration (h)</th>
                  <th>Closure</th>
                  <th>Impact Score</th>
                  <th>Response Tier</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => (
                  <tr key={r.id}>
                    <td style={{fontFamily:'monospace',fontSize:11}}>{r.id}</td>
                    <td>
                      <span className={`badge ${r.event_type==='planned'?'badge-purple':'badge-orange'}`}>
                        {r.event_type}
                      </span>
                    </td>
                    <td>{(r.event_cause||'').replace(/_/g,' ')}</td>
                    <td style={{fontSize:12}}>{r.zone||'—'}</td>
                    <td>{r.duration_hours!=null ? r.duration_hours.toFixed(1) : '—'}</td>
                    <td>
                      <span className={`badge ${r.requires_road_closure?'badge-red':'badge-green'}`}>
                        {r.requires_road_closure?'Yes':'No'}
                      </span>
                    </td>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:32,height:32,borderRadius:'50%',
                          background:`${impactColor(r.impact)}22`,
                          border:`2px solid ${impactColor(r.impact)}`,
                          display:'flex',alignItems:'center',justifyContent:'center',
                          fontSize:10,fontWeight:800,color:impactColor(r.impact)}}>
                          {r.impact}
                        </div>
                      </div>
                    </td>
                    <td style={{fontSize:12,color:'var(--text-muted)'}}>{r.tier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{padding:'12px 16px',fontSize:12,color:'var(--text-muted)'}}>
              Showing top 200 of {rows.length} events
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

