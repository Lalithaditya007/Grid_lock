'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { loadEvents } from '@/lib/parseData';
import { buildStats } from '@/lib/statsBuilder';
import { buildTemporalStats, predictWeekRisk } from '@/lib/forecaster';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  ArcElement, LineElement, PointElement, Tooltip, Legend, Filler
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement,
  LineElement, PointElement, Tooltip, Legend, Filler);

const TOOLTIP = { backgroundColor:'#111C33', titleColor:'#F5F7FA', bodyColor:'#aaa', borderColor:'rgba(41,121,255,0.2)', borderWidth:1 };

const CHART_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,               // disables bar/line animation — biggest chart perf win
  plugins: { legend: { display: false }, tooltip: TOOLTIP },
  scales: {
    x: { grid: { color:'rgba(41,121,255,0.05)' }, ticks: { color:'#667', font:{size:10} } },
    y: { grid: { color:'rgba(41,121,255,0.05)' }, ticks: { color:'#667', font:{size:10} } },
  },
};

const DONUT_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: { position:'right', labels:{color:'#aaa',font:{size:11},boxWidth:12} },
    tooltip: TOOLTIP,
  },
};

export default function Forecast() {
  const [ts, setTs] = useState(null);
  const [weekRisk, setWeekRisk] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents().then(evs => {
      const stats = buildStats(evs);
      const temp  = buildTemporalStats(evs);
      setTs(temp);
      setWeekRisk(predictWeekRisk(temp, evs));
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="page-layout"><Sidebar/><div className="main-content">
    <div className="loading-wrap" style={{minHeight:'100vh'}}><div className="spinner"/><span>Crunching temporal data…</span></div>
  </div></div>;

  const HOURS = Array.from({length:24},(_,i)=>`${i}:00`);
  const DAYS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTHS= ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const PALETTE = ['#2979FF','#FF6584','#27AE60','#FFD32A','#FF6B35','#00D2FF','#FF4757','#a29bfe','#fd79a8','#55efc4'];

  function riskColor(r) {
    if (r >= 70) return 'var(--red)';
    if (r >= 50) return 'var(--orange)';
    if (r >= 30) return 'var(--amber)';
    return 'var(--green)';
  }

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <h2>📈 Temporal Forecast</h2>
          <p>Historical event patterns and 7-day risk outlook based on weekday/monthly distributions</p>
        </div>
        <div className="page-body">

          {/* 7-Day Risk Outlook */}
          <div className="section-title">📅 7-Day Risk Outlook</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:10,marginBottom:28}}>
            {weekRisk.map((d,i) => (
              <div key={i} className="glass-card" style={{textAlign:'center',padding:'16px 8px',
                borderTop:`3px solid ${riskColor(d.risk)}`}}>
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>{d.dayName}</div>
                <div style={{fontSize:22,fontWeight:800,color:riskColor(d.risk)}}>{d.risk}</div>
                <div style={{fontSize:9,color:'var(--text-muted)',marginTop:4}}>{d.date}</div>
              </div>
            ))}
          </div>

          {/* Charts Grid */}
          <div className="grid-2" style={{marginBottom:24}}>
            <div className="glass-card">
              <div className="section-title">⏰ Hourly Distribution</div>
              <div style={{height:220}}>
                <Bar data={{
                  labels: HOURS,
                  datasets: [{
                    data: ts.byHour,
                    backgroundColor: ts.byHour.map(v => {
                      const m = Math.max(...ts.byHour);
                      const i = v / m;
                      return `hsl(${240 - i*180}, 70%, ${40 + i*20}%)`;
                    }),
                    borderRadius: 4, borderSkipped: false,
                  }]
                }} options={CHART_OPTS} />
              </div>
            </div>

            <div className="glass-card">
              <div className="section-title">📅 Day of Week Distribution</div>
              <div style={{height:220}}>
                <Bar data={{
                  labels: DAYS,
                  datasets: [{
                    data: ts.byDay,
                    backgroundColor: '#6C63FF88',
                    hoverBackgroundColor: '#2979FF',
                    borderRadius: 6, borderSkipped: false,
                  }]
                }} options={CHART_OPTS} />
              </div>
            </div>

            <div className="glass-card">
              <div className="section-title">📆 Monthly Trend</div>
              <div style={{height:220}}>
                <Line data={{
                  labels: MONTHS,
                  datasets: [{
                    data: ts.byMonth,
                    borderColor: '#2979FF',
                    backgroundColor: 'rgba(108,99,255,0.15)',
                    fill: true, tension: 0.4, pointBackgroundColor: '#FF6584',
                    pointRadius: 5,
                  }]
                }} options={CHART_OPTS} />
              </div>
            </div>

            <div className="glass-card">
              <div className="section-title">🔍 Event Cause Breakdown</div>
              <div style={{height:220}}>
                <Doughnut data={{
                  labels: Object.keys(ts.byCause).map(k=>k.replace(/_/g,' ')),
                  datasets: [{
                    data: Object.values(ts.byCause),
                    backgroundColor: PALETTE,
                    borderColor: '#0a0a14', borderWidth: 2,
                  }]
                }} options={DONUT_OPTS} />
              </div>
            </div>
          </div>

          {/* Zone Breakdown */}
          <div className="glass-card">
            <div className="section-title">🗺️ Zone-Wise Incident Count</div>
            <div style={{height:300}}>
              <Bar data={{
                labels: Object.entries(ts.byZone).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([k])=>k||'Unknown'),
                datasets: [{
                  data: Object.entries(ts.byZone).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([,v])=>v),
                  backgroundColor: PALETTE.map(c => c + '99'),
                  hoverBackgroundColor: PALETTE,
                  borderRadius: 6, borderSkipped: false,
                }]
              }} options={{...CHART_OPTS, indexAxis:'y', animation:false,
                scales:{
                  x:{grid:{color:'rgba(41,121,255,0.05)'},ticks:{color:'#667'}},
                  y:{grid:{display:false},ticks:{color:'#aaa',font:{size:10}}},
                }}} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}


