'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { loadEvents } from '@/lib/parseData';
import { buildStats } from '@/lib/statsBuilder';
import {
  trainEnsemble, predict, isModelTrained,
  getFeatureImportance, getEnsembleState, FEATURE_LABELS,
} from '@/lib/mlModel';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const TOOLTIP_STYLE = {
  backgroundColor:'#111C33', titleColor:'#F5F7FA',
  bodyColor:'#aaa', borderColor:'rgba(41,121,255,0.2)', borderWidth:1,
};

function MetricCard({ label, value, unit='', color='var(--purple)', sub='', good=true }) {
  return (
    <div style={{
      background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12,
      padding:'16px 20px', borderTop:`3px solid ${color}`,
    }}>
      <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',
        textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>{label}</div>
      <div style={{fontSize:30,fontWeight:800,color,letterSpacing:-1,lineHeight:1}}>
        {value}<span style={{fontSize:13,fontWeight:400,color:'var(--text-muted)',marginLeft:3}}>{unit}</span>
      </div>
      {sub && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>{sub}</div>}
    </div>
  );
}

function ModelRow({ model, isEnsemble=false }) {
  const m = isEnsemble ? model : model.metrics;
  const label = isEnsemble ? '🎯 Ensemble (Weighted)' : model.label;
  return (
    <tr style={{ background: isEnsemble ? 'rgba(41,121,255,0.06)' : 'transparent' }}>
      <td style={{padding:'10px 14px',fontWeight: isEnsemble ? 700 : 400,
        color: isEnsemble ? 'var(--purple)' : 'var(--text-primary)',fontSize:13}}>{label}</td>
      {!isEnsemble && <td style={{padding:'10px 14px',fontSize:12,color:'var(--text-muted)'}}>
        [{model.hidden.join('→')}]</td>}
      {isEnsemble && <td style={{padding:'10px 14px',fontSize:12,color:'var(--text-muted)'}}>Weighted avg</td>}
      <td style={{padding:'10px 14px',fontWeight:700,color:m.r2>=0.7?'var(--green)':m.r2>=0.5?'var(--amber)':'var(--red)'}}>
        {m.r2}</td>
      <td style={{padding:'10px 14px',color:'var(--text-secondary)'}}>{m.mae}</td>
      <td style={{padding:'10px 14px',color:'var(--text-secondary)'}}>{m.rmse}</td>
      <td style={{padding:'10px 14px',color:'var(--green)',fontWeight:600}}>{m.acc10}%</td>
      <td style={{padding:'10px 14px',color:'var(--amber)'}}>{m.acc20}%</td>
      {!isEnsemble && <td style={{padding:'10px 14px',fontSize:12,color:'var(--text-muted)'}}>
        {(model.weight * 100).toFixed(1)}%</td>}
      {isEnsemble && <td style={{padding:'10px 14px',fontSize:12,color:'var(--purple)'}}>—</td>}
    </tr>
  );
}

export default function PredictPage() {
  const [stats, setStats] = useState(null);
  const [zones, setZones] = useState([]);
  const [causes, setCauses] = useState([]);
  const [trained, setTrained]   = useState(false);
  const [training, setTraining] = useState(false);
  const [trainLog, setTrainLog] = useState([]);
  const [trainPct, setTrainPct] = useState(0);
  const [modelCards, setModelCards] = useState([]);  // per-model metrics
  const [ensembleMetrics, setEnsembleMetrics] = useState(null);

  const [form, setForm] = useState({
    zone: '', cause: '', junction:'', hour: 9, dayOfWeek: 1, month: 6,
    hasClosure: false, priority: 'High', eventType: 'unplanned', duration: 2,
  });
  const [prediction, setPrediction] = useState(null);  // {score, low, high}
  const [importance, setImportance] = useState([]);

  useEffect(() => {
    loadEvents().then(async evs => {
      const s = buildStats(evs);
      setStats(s);
      setZones(s.zones || []);
      setCauses(s.causes || []);
      setForm(f => ({ ...f, zone: (s.zones||[])[0]||'', cause: (s.causes||[])[0]||'' }));

      setTraining(true);
      setTrainLog(['⚡ Starting ensemble training on ' + evs.length + ' events…']);

      const result = await trainEnsemble(evs, s, (pct, msg, modelIdx, metrics) => {
        setTrainPct(pct);
        setTrainLog(prev => [...prev.slice(-6), msg]);
        if (metrics && modelIdx < 3) {
          setModelCards(prev => {
            const next = [...prev];
            const st = getEnsembleState();
            if (st) next[modelIdx] = st.models[modelIdx];
            return next;
          });
        }
        if (pct === 100 && metrics) setEnsembleMetrics(metrics);
      });

      if (result) {
        setModelCards(result.models);
        setEnsembleMetrics(result.ensembleMetrics);
      }
      setTrained(true);
      setTraining(false);
    });
  }, []);

  function runPrediction() {
    if (!trained) return;
    const result = predict({
      zone: form.zone, cause: form.cause, junction: form.junction,
      hour: form.hour, month: form.month,
      hasClosure: form.hasClosure, priority: form.priority,
      eventType: form.eventType, duration: form.duration,
    });
    setPrediction(result);
    setImportance(getFeatureImportance({
      zone: form.zone, cause: form.cause, junction: form.junction,
      hour: form.hour, month: form.month,
      hasClosure: form.hasClosure, priority: form.priority,
      eventType: form.eventType, duration: form.duration,
    }));
  }

  function riskColor(s) {
    if (s >= 80) return 'var(--red)';
    if (s >= 60) return 'var(--orange)';
    if (s >= 35) return 'var(--amber)';
    return 'var(--green)';
  }
  function riskLabel(s) {
    if (s >= 80) return 'CRITICAL';
    if (s >= 60) return 'HIGH';
    if (s >= 35) return 'MEDIUM';
    return 'LOW';
  }

  const em = ensembleMetrics;

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <h2>🤖 AI Ensemble Predictor</h2>
          <p>3-model weighted ensemble · 12 features · 80/20 holdout validation · R² metrics</p>
        </div>
        <div className="page-body" style={{paddingBottom:60}}>

          {/* ── Training Status ──────────────────────────────────────────── */}
          <div className="glass-card fade-up" style={{marginBottom:24,
            borderLeft:`3px solid ${trained?'var(--green)':training?'var(--purple)':'var(--border)'}`}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:training||trainLog.length?12:0}}>
              {training && <div className="spinner" style={{width:20,height:20,borderWidth:2}}/>}
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14}}>
                  {trained ? '✅ Ensemble trained and ready for inference'
                    : training ? trainLog[trainLog.length-1] || 'Initialising…'
                    : 'Awaiting data…'}
                </div>
                {trained && em && (
                  <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:4}}>
                    Ensemble R²={em.r2} · MAE={em.mae} · RMSE={em.rmse} · Acc±10={em.acc10}% · Holdout n={em.n}
                  </div>
                )}
              </div>
            </div>
            {training && (
              <div>
                <div style={{display:'flex',justifyContent:'space-between',
                  fontSize:11,color:'var(--text-muted)',marginBottom:4}}>
                  <span>{trainLog[trainLog.length-1] || '…'}</span>
                  <span style={{color:'var(--purple)'}}>{trainPct}%</span>
                </div>
                <div className="progress-bar-track" style={{height:6}}>
                  <div className="progress-bar-fill" style={{
                    width:`${trainPct}%`,
                    background:'linear-gradient(90deg,#2979FF,#27AE60)',
                    transition:'width 0.3s ease'}} />
                </div>
              </div>
            )}
          </div>

          {/* ── Ensemble Metrics KPI Cards ───────────────────────────────── */}
          {em && (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',
              gap:14,marginBottom:24}} className="fade-up">
              <MetricCard label="R² Score" value={em.r2}
                color={em.r2>=0.7?'var(--green)':em.r2>=0.5?'var(--amber)':'var(--red)'}
                sub="Variance explained" />
              <MetricCard label="MAE" value={em.mae} unit="pts"
                color="var(--purple)" sub="Mean absolute error" />
              <MetricCard label="RMSE" value={em.rmse} unit="pts"
                color="var(--amber)" sub="Root mean sq. error" />
              <MetricCard label="Acc ±10 pts" value={em.acc10} unit="%"
                color="var(--green)" sub="Predictions within ±10" />
              <MetricCard label="Acc ±20 pts" value={em.acc20} unit="%"
                color="#00b8d4" sub="Predictions within ±20" />
              <MetricCard label="Holdout Size" value={em.n} unit=" events"
                color="var(--text-muted)" sub="20% test split" />
            </div>
          )}

          {/* ── Model Comparison Table ───────────────────────────────────── */}
          {modelCards.length > 0 && (
            <div className="glass-card fade-up" style={{marginBottom:24,overflowX:'auto'}}>
              <div className="section-title" style={{marginBottom:16}}>📊 Model Comparison (Holdout Set)</div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Model</th><th>Architecture</th>
                    <th>R²</th><th>MAE</th><th>RMSE</th>
                    <th>Acc ±10</th><th>Acc ±20</th><th>Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {modelCards.map((m, i) => <ModelRow key={i} model={m} />)}
                  {em && <ModelRow model={em} isEnsemble />}
                </tbody>
              </table>
              <div style={{fontSize:11,color:'var(--text-muted)',padding:'10px 14px',
                borderTop:'1px solid var(--border)'}}>
                Weights assigned as 1/MAE (normalized) — models with lower error get higher vote
              </div>
            </div>
          )}

          {/* ── Prediction Form + Result ─────────────────────────────────── */}
          <div className="grid-sidebar" style={{gap:20}}>
            <div className="glass-card fade-up">
              <div className="section-title" style={{marginBottom:16}}>🔮 Predict Traffic Impact</div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Zone</label>
                  <select className="form-select" value={form.zone}
                    onChange={e=>setForm({...form,zone:e.target.value})}>
                    {zones.map(z=><option key={z}>{z}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Event Cause</label>
                  <select className="form-select" value={form.cause}
                    onChange={e=>setForm({...form,cause:e.target.value})}>
                    {causes.map(c=><option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Event Type</label>
                  <select className="form-select" value={form.eventType}
                    onChange={e=>setForm({...form,eventType:e.target.value})}>
                    <option value="unplanned">Unplanned</option>
                    <option value="planned">Planned</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select className="form-select" value={form.priority}
                    onChange={e=>setForm({...form,priority:e.target.value})}>
                    <option value="High">High</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Hour of Day — {form.hour}:00{
                  ((form.hour>=7&&form.hour<=10)||(form.hour>=17&&form.hour<=20))
                    ? ' ⚡ Peak' : ''}</label>
                <input type="range" min="0" max="23" value={form.hour}
                  onChange={e=>setForm({...form,hour:+e.target.value})}
                  style={{width:'100%',accentColor:'var(--purple)'}}/>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Month — {'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[form.month-1]}</label>
                  <input type="range" min="1" max="12" value={form.month}
                    onChange={e=>setForm({...form,month:+e.target.value})}
                    style={{width:'100%',accentColor:'var(--purple)'}}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Expected Duration — {form.duration}h</label>
                  <input type="range" min="0" max="48" value={form.duration}
                    onChange={e=>setForm({...form,duration:+e.target.value})}
                    style={{width:'100%',accentColor:'var(--purple)'}}/>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
                  <input type="checkbox" checked={form.hasClosure}
                    onChange={e=>setForm({...form,hasClosure:e.target.checked})}
                    style={{width:16,height:16,accentColor:'var(--purple)'}}/>
                  Road Closure Expected
                </label>
              </div>

              <button className="btn btn-primary pulse" style={{width:'100%',marginTop:4}}
                onClick={runPrediction} disabled={!trained}>
                {trained ? '🤖 Run Ensemble Prediction' : '⏳ Training…'}
              </button>

              {/* Model Architecture Info */}
              <div style={{marginTop:20,padding:'14px 16px',background:'rgba(41,121,255,0.05)',
                borderRadius:10,border:'1px solid rgba(41,121,255,0.12)'}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',
                  textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>Ensemble Architecture</div>
                {[
                  { label:'Net-A Wide',  arch:'12→24→12→1', role:'General patterns' },
                  { label:'Net-B Deep',  arch:'12→16→12→8→1',role:'Non-linear depth' },
                  { label:'Net-C Fast',  arch:'12→12→1',     role:'Quick convergence' },
                ].map(m => (
                  <div key={m.label} style={{display:'flex',gap:10,marginBottom:7,fontSize:12}}>
                    <span style={{color:'var(--purple)',fontWeight:700,minWidth:80}}>{m.label}</span>
                    <span style={{color:'var(--text-muted)',fontFamily:'monospace'}}>{m.arch}</span>
                    <span style={{color:'var(--text-secondary)',marginLeft:'auto'}}>{m.role}</span>
                  </div>
                ))}
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:8}}>
                  📊 12 features · NULL imputation · Frequency encoding · Median duration fill
                </div>
              </div>
            </div>

            {/* Prediction Result */}
            <div>
              {prediction !== null ? (
                <div className="fade-up">
                  {/* Score ring */}
                  <div className="glass-card" style={{textAlign:'center',marginBottom:16,padding:'36px 20px',
                    border:`1px solid ${riskColor(prediction.score)}33`}}>
                    <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',
                      textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>
                      Ensemble Impact Score
                    </div>
                    <div style={{fontSize:80,fontWeight:900,letterSpacing:-4,
                      color:riskColor(prediction.score),lineHeight:1}}>
                      {prediction.score}
                    </div>
                    <div style={{marginTop:10}}>
                      <span style={{padding:'4px 14px',borderRadius:20,fontSize:12,fontWeight:700,
                        background:`${riskColor(prediction.score)}22`,
                        color:riskColor(prediction.score),border:`1px solid ${riskColor(prediction.score)}44`}}>
                        {riskLabel(prediction.score)}
                      </span>
                    </div>
                    {/* Confidence interval */}
                    <div style={{marginTop:14,fontSize:12,color:'var(--text-secondary)'}}>
                      Confidence range:&nbsp;
                      <span style={{color:'var(--purple)',fontWeight:700}}>
                        {prediction.low} – {prediction.high}
                      </span>
                      &nbsp;(±RMSE)
                    </div>
                    {/* Visual range bar */}
                    <div style={{margin:'14px auto 0',maxWidth:220,height:8,
                      background:'rgba(255,255,255,0.08)',borderRadius:4,position:'relative'}}>
                      <div style={{
                        position:'absolute',
                        left:`${prediction.low}%`,
                        width:`${prediction.high - prediction.low}%`,
                        height:'100%',
                        background:`${riskColor(prediction.score)}55`,
                        borderRadius:4,
                      }}/>
                      <div style={{
                        position:'absolute',
                        left:`${prediction.score}%`,
                        transform:'translateX(-50%)',
                        width:12,height:12,borderRadius:'50%',
                        background:riskColor(prediction.score),
                        top:-2,border:'2px solid #081121',
                      }}/>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:10,
                      color:'var(--text-muted)',marginTop:4,maxWidth:220,margin:'6px auto 0'}}>
                      <span>0 (Low)</span><span>50</span><span>100 (Critical)</span>
                    </div>
                  </div>

                  {/* Feature importance */}
                  {importance.length > 0 && (
                    <div className="glass-card">
                      <div className="section-title" style={{marginBottom:12}}>
                        📊 Feature Importance (Permutation)
                      </div>
                      <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:14}}>
                        How much each feature shifts the prediction when zeroed out
                      </div>
                      <div style={{height:260}}>
                        <Bar
                          data={{
                            labels: importance.map(f => f.label),
                            datasets:[{
                              data: importance.map(f => f.importance),
                              backgroundColor: importance.map((_, i) =>
                                `hsl(${190 + i * 18},80%,${60 - i*2}%)`),
                              borderRadius: 5,
                            }]
                          }}
                          options={{
                            responsive:true, maintainAspectRatio:false,
                            indexAxis:'y', animation:false,
                            plugins:{ legend:{display:false}, tooltip:TOOLTIP_STYLE },
                            scales:{
                              x:{grid:{color:'rgba(41,121,255,0.05)'},ticks:{color:'#667'}},
                              y:{grid:{display:false},ticks:{color:'#aaa',font:{size:10}}},
                            },
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="glass-card" style={{textAlign:'center',padding:60,color:'var(--text-muted)'}}>
                  <div style={{fontSize:60,marginBottom:12}}>🤖</div>
                  <div style={{fontSize:15,fontWeight:600,color:'var(--text-primary)',marginBottom:8}}>
                    {trained ? 'Ensemble ready' : 'Training 3 neural networks…'}
                  </div>
                  <div style={{fontSize:13}}>
                    {trained
                      ? 'Fill the form on the left and click predict'
                      : 'Page stays fully interactive during training'}
                  </div>
                  {training && (
                    <div style={{marginTop:20}}>
                      <div className="progress-bar-track" style={{height:4,maxWidth:200,margin:'0 auto'}}>
                        <div className="progress-bar-fill" style={{
                          width:`${trainPct}%`,
                          background:'linear-gradient(90deg,#2979FF,#27AE60)',
                          transition:'width 0.3s'}}/>
                      </div>
                      <div style={{fontSize:11,color:'var(--text-muted)',marginTop:8}}>{trainPct}% complete</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

