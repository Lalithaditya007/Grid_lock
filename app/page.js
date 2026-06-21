'use client';
import { useEffect, useState, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import { loadEvents } from '@/lib/parseData';
import { buildStats } from '@/lib/statsBuilder';
import { getResourceRecommendation } from '@/lib/resourceEngine';

// ── Helpers ──────────────────────────────────────────────────────────────────
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

// Hour-based risk from historical data
function hourlyRisk(hourCounts, hour) {
  const count = hourCounts[hour] || 0;
  const max   = Math.max(...Object.values(hourCounts), 1);
  return Math.round((count / max) * 100);
}

// Generate today's hourly outlook labels
function todayOutlook(hourCounts) {
  const hours  = [6,8,10,12,14,16,18,20,22];
  return hours.map(h => {
    const score = hourlyRisk(hourCounts, h);
    return { hour: h, score, label: riskLabel(score) };
  });
}

// ── Alert Card ────────────────────────────────────────────────────────────────
function AlertCard({ zone, score, events, rank }) {
  const rc = riskColor(score);
  const rl = riskLabel(score);
  const res = getResourceRecommendation(score);
  const peakHour = 17 + (rank % 3); // stagger example peak hours

  return (
    <div style={{
      background: '#FFFFFF',
      border: `1px solid ${rc}30`,
      borderLeft: `4px solid ${rc}`,
      borderRadius: 10,
      padding: '14px 16px',
      marginBottom: 10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#0F172A', marginBottom: 2 }}>
            {zone}
          </div>
          <span className={`risk-pill ${riskClass(score)}`}>{rl} Risk</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: rc, lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>Impact</div>
        </div>
      </div>

      {/* Info row */}
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#64748B', marginBottom: 10 }}>
        <span>📍 {events} incidents</span>
        <span>🕐 Peak ~{peakHour}:00</span>
        <span>⏱ Est. 2–4h</span>
      </div>

      {/* Actions */}
      <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.8 }}>
        {res.notes.slice(0, 2).map((n, i) => (
          <div key={i}>• {n}</div>
        ))}
        <div>• Deploy {res.officers} officers · {res.barricades} barricades</div>
      </div>
    </div>
  );
}

// ── Timeline slot ─────────────────────────────────────────────────────────────
function TimelineSlots({ outlook }) {
  const bgFor = (label) => {
    if (label === 'Critical') return '#DC2626';
    if (label === 'High')     return '#EA580C';
    if (label === 'Medium')   return '#F59E0B';
    return '#16A34A';
  };
  const fmt = (h) => `${h > 12 ? h - 12 : h}${h >= 12 ? 'PM' : 'AM'}`;

  return (
    <div>
      <div className="timeline-bar">
        {outlook.map(slot => (
          <div key={slot.hour} className="timeline-slot"
            style={{ background: bgFor(slot.label), color: '#fff', gap: 0 }}
            title={`${fmt(slot.hour)} — ${slot.label}`}>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        {outlook.map(slot => (
          <div key={slot.hour} style={{ textAlign: 'center', minWidth: 0 }}>
            <div style={{ fontSize: 9, color: '#94A3B8', fontWeight: 600 }}>{fmt(slot.hour)}</div>
            <div style={{ fontSize: 9, color: '#64748B' }}>{slot.label.slice(0,3)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [events, setEvents] = useState([]);
  const [stats, setStats]   = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [filter, setFilter] = useState('all');
  const mapRef  = useRef(null);

  useEffect(() => {
    loadEvents().then(evs => {
      setEvents(evs);
      setStats(buildStats(evs));
    });
  }, []);

  useEffect(() => {
    if (!events.length || mapLoaded) return;
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key || window.google) { initMap(); return; }
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    s.async = true;
    s.onload = () => initMap();
    document.head.appendChild(s);
  }, [events]);

  function initMap() {
    if (!mapRef.current || !window.google) return;
    setMapLoaded(true);
    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 12.97, lng: 77.59 },
      zoom: 11,
      styles: mapStyles,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
    });
    const shown = (filter === 'all' ? events : events.filter(e => e.event_type === filter)).slice(0, 500);
    const markers = shown.map(e => {
      const color = e.priority === 'High'
        ? (e.event_type === 'planned' ? '#2563EB' : '#DC2626')
        : '#16A34A';
      return new window.google.maps.Marker({
        position: { lat: e.latitude, lng: e.longitude },
        title: `${e.event_cause} — ${e.zone}`,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 5, fillColor: color, fillOpacity: 0.8, strokeWeight: 0 },
      });
    });
    if (!window.MarkerClusterer) {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js';
      s.onload = () => new window.markerClusterer.MarkerClusterer({ map, markers });
      document.head.appendChild(s);
    } else {
      new window.markerClusterer.MarkerClusterer({ map, markers });
    }
  }

  // Derived stats
  const highRiskZones = stats
    ? Object.entries(stats.zoneClosureRate).filter(([, r]) => r > 0.3).length
    : 0;
  const activeEvents  = events.filter(e => e.status === 'active').length || Math.round(events.length * 0.012);
  const totalResources = highRiskZones * 15 + activeEvents * 3;

  // Top alert zones by closure rate + volume
  const alertZones = stats
    ? Object.entries(stats.zoneCounts)
        .map(([zone, count]) => ({
          zone,
          count,
          closureRate: stats.zoneClosureRate[zone] || 0,
          score: Math.round(((stats.zoneClosureRate[zone] || 0) * 45) + ((count / (Math.max(...Object.values(stats.zoneCounts)) || 1)) * 55)),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
    : [];

  // Hourly counts from data
  const hourCounts = {};
  events.forEach(e => {
    if (e.start_datetime) {
      const h = e.start_datetime.getHours();
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    }
  });
  const outlook = events.length ? todayOutlook(hourCounts) : [];

  const peakHour = Object.entries(hourCounts).sort((a,b) => b[1]-a[1])[0];
  const peakLabel = peakHour ? `${peakHour[0]}:00 – ${(+peakHour[0]+2)}:00` : '17:00–19:00';

  const kpis = [
    { label: 'Active Incidents',     value: activeEvents,     sub: 'currently monitored',          color: 'red',    icon: '🚨' },
    { label: 'High Risk Zones',      value: highRiskZones,    sub: 'critical zones flagged',       color: 'orange', icon: '⚠️' },
    { label: 'Predicted Peak',       value: peakLabel,        sub: 'highest incident window',      color: 'amber',  icon: '⏰' },
    { label: 'Resources Required',   value: totalResources,   sub: 'officers & units recommended', color: 'purple', icon: '👮' },
  ];

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="main-content">
        {/* ── Hero Header ── */}
        <div className="page-header" style={{ paddingBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>
                Event Intelligence Command Center
              </h2>
              <p style={{ marginBottom: 20 }}>
                Forecast congestion and coordinate response before traffic breaks down.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
              {['all','planned','unplanned'].map(f => (
                <button key={f} className={`chip${filter === f ? ' active' : ''}`}
                  onClick={() => { setFilter(f); setMapLoaded(false); }}>
                  {f === 'all' ? 'All Events' : f === 'planned' ? '📅 Planned' : '⚡ Unplanned'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="page-body">

          {/* ── KPI Row ── */}
          <div className="kpi-grid fade-up" style={{ marginBottom: 20 }}>
            {kpis.map(k => (
              <div key={k.label} className={`kpi-card ${k.color}`}>
                <div className="kpi-label">{k.icon} {k.label}</div>
                <div className="kpi-value" style={{
                  color: k.color === 'red' ? 'var(--red)' : k.color === 'orange' ? 'var(--orange)' : k.color === 'amber' ? 'var(--amber)' : 'var(--purple)',
                  fontSize: typeof k.value === 'string' && k.value.includes(':') ? 20 : 32,
                }}>{k.value}</div>
                <div className="kpi-sub">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Today's Outlook Timeline ── */}
          {outlook.length > 0 && (
            <div className="glass-card fade-up" style={{ marginBottom: 20 }}>
              <div className="section-title">📅 Today&apos;s Traffic Outlook</div>
              <TimelineSlots outlook={outlook} />
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {[['#16A34A','Low'],['#F59E0B','Medium'],['#EA580C','High'],['#DC2626','Critical']].map(([c,l]) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748B' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />{l}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 70/30 Main Layout ── */}
          <div className="grid-70-30" style={{ alignItems: 'start' }}>

            {/* ── Left 70%: Live Congestion Map ── */}
            <div className="glass-card fade-up" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="section-title" style={{ marginBottom: 0 }}>🗺️ Live Congestion Map</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  {[['#DC2626','High Priority'],['#2563EB','Planned'],['#16A34A','Low Priority']].map(([c,l]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748B' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{l}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ height: 480 }}>
                {!events.length
                  ? <div className="loading-wrap"><div className="spinner" /><span>Loading map data…</span></div>
                  : <div ref={mapRef} style={{ width: '100%', height: '100%' }} />}
              </div>
            </div>

            {/* ── Right 30%: Critical Alert Panel ── */}
            <div>
              <div className="glass-card fade-up" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: '#FEF2F2' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626' }} className="pulse-alert" />
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#991B1B' }}>Critical Alert Panel</div>
                  </div>
                  <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 2 }}>
                    {alertZones.filter(z => z.score >= 60).length} zones require immediate attention
                  </div>
                </div>
                <div style={{ padding: '12px 12px 4px' }}>
                  {alertZones.length === 0 ? (
                    <div className="loading-wrap" style={{ minHeight: 100 }}><div className="spinner" /></div>
                  ) : alertZones.map((z, i) => (
                    <AlertCard key={z.zone} zone={z.zone} score={z.score} events={z.count} rank={i} />
                  ))}
                </div>
              </div>

              {/* Quick stats below alert panel */}
              {stats && (
                <div className="glass-card fade-up" style={{ marginTop: 16 }}>
                  <div className="section-title">📊 Top Incident Causes</div>
                  {Object.entries(stats.causeCounts)
                    .sort((a,b) => b[1]-a[1]).slice(0,5)
                    .map(([cause, count]) => (
                      <div className="stat-row" key={cause}>
                        <span className="stat-key">{cause.replace(/_/g,' ')}</span>
                        <span className="stat-value" style={{ color: 'var(--purple)' }}>{count.toLocaleString()}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

const mapStyles = [
  { elementType: 'geometry', stylers: [{ color: '#F1F5F9' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#64748B' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E2E8F0' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#DBEAFE' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#BFDBFE' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];
