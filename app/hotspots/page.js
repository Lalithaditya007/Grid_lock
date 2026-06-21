'use client';
import { useEffect, useState, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import { loadEvents } from '@/lib/parseData';
import { dbscanAsync } from '@/lib/dbscan';

export default function Hotspots() {
  const [clusters, setClusters] = useState([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [eps, setEps] = useState(600);
  const [minPts, setMinPts] = useState(8);
  const [clustering, setClustering] = useState(false);
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => { loadAndCluster(eps, minPts); }, []);

  async function loadAndCluster(e2, m2) {
    setClustering(true);
    const evs = await loadEvents();           // instant after first load (singleton Promise)
    setTotalEvents(evs.length);
    const pts = evs.map(ev => ({ lat: ev.latitude, lng: ev.longitude, ...ev }));
    const result = await dbscanAsync(pts, e2, m2);   // async — yields to browser between calls
    setClusters(result);
    setMapLoaded(false);
    setClustering(false);
  }

  useEffect(() => {
    if (!clusters.length || mapLoaded) return;
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return;
    if (window.google) { renderMap(); return; }
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    s.async = true;
    s.onload = renderMap;
    document.head.appendChild(s);
  }, [clusters]);

  function renderMap() {
    if (!mapRef.current || !window.google) return;
    setMapLoaded(true);
    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 12.97, lng: 77.59 }, zoom: 11,
      styles: lightMapStyles, disableDefaultUI: false,
    });
    const maxCount = clusters[0]?.count || 1;
    clusters.slice(0, 20).forEach((c, i) => {
      const intensity = c.count / maxCount;
      const radius = 300 + intensity * 800;
      new window.google.maps.Circle({
        map, center: { lat: c.lat, lng: c.lng }, radius,
        fillColor: `hsl(${Math.round(240 - intensity * 180)}, 85%, 60%)`,
        fillOpacity: 0.35 + intensity * 0.25,
        strokeColor: `hsl(${Math.round(240 - intensity * 180)}, 90%, 70%)`,
        strokeOpacity: 0.8, strokeWeight: 1.5,
      });
      new window.google.maps.Marker({
        map, position: { lat: c.lat, lng: c.lng },
        label: { text: `#${i+1}`, color: '#fff', fontSize: '11px', fontWeight: '700' },
        title: `Cluster ${i+1}: ${c.count} incidents`,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 14,
          fillColor: '#2979FF', fillOpacity: 1, strokeWeight: 2, strokeColor: '#fff' },
      });
    });
  }

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <h2>🗺️ Hotspots & Maps</h2>
          <p>Interactive map and top risk zones based on spatial event clustering.</p>
        </div>
        <div className="page-body">
          {/* Controls */}
          <div className="glass-card fade-up" style={{marginBottom:20}}>
            <div style={{display:'flex',gap:20,flexWrap:'wrap',alignItems:'flex-end'}}>
              <div className="form-group" style={{margin:0,minWidth:200}}>
                <label className="form-label">Radius (ε = {eps}m)</label>
                <input type="range" min="200" max="2000" step="100" value={eps}
                  onChange={e => setEps(+e.target.value)}
                  style={{width:'100%',accentColor:'var(--purple)'}} />
              </div>
              <div className="form-group" style={{margin:0,minWidth:180}}>
                <label className="form-label">Min Points ({minPts})</label>
                <input type="range" min="3" max="30" step="1" value={minPts}
                  onChange={e => setMinPts(+e.target.value)}
                  style={{width:'100%',accentColor:'var(--purple)'}} />
              </div>
              <button className="btn btn-primary" onClick={() => loadAndCluster(eps, minPts)}>
                🔄 Re-cluster
              </button>
              <div style={{fontSize:13,color:'var(--text-secondary)'}}>
                Found <strong style={{color:'var(--purple)'}}>{clusters.length}</strong> clusters
              </div>
            </div>
          </div>

          <div className="grid-sidebar">
            {/* Top clusters list */}
            <div>
              <div className="section-title">Top Risk Zones</div>
              {clusters.slice(0,10).map((c, i) => {
                const pct = Math.round((c.count / (clusters[0]?.count || 1)) * 100);
                return (
                  <div key={i} className="glass-card" style={{marginBottom:10,padding:'14px 18px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:26,height:26,borderRadius:'50%',
                          background:`var(--purple)`,
                          display:'flex',alignItems:'center',justifyContent:'center',
                          fontSize:11,fontWeight:700,color:'#fff'}}>
                          {i+1}
                        </div>
                        <span style={{fontWeight:600,fontSize:13}}>
                          {c.lat.toFixed(4)}°N, {c.lng.toFixed(4)}°E
                        </span>
                      </div>
                      <span style={{fontWeight:800,color:'var(--purple)',fontSize:15}}>{c.count}</span>
                    </div>
                    <div className="progress-bar-track" style={{marginBottom: 8}}>
                      <div className="progress-bar-fill"
                        style={{width:`${pct}%`, background:`var(--purple)`}} />
                    </div>
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize:11, color:'var(--text-secondary)'}}>
                      <div><span style={{color:'var(--red)'}}>Risk: Critical</span></div>
                      <div>Delay: {Math.round(c.count * 1.5)}m</div>
                      <div>Trend: 📈</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Map */}
            <div>
              <div className="section-title">🗺️ Cluster Heatmap</div>
              <div className="map-container" style={{height:560}}>
                {!clusters.length
                  ? <div className="loading-wrap"><div className="spinner"/><span>Clustering…</span></div>
                  : <div ref={mapRef} style={{width:'100%',height:'100%'}} />
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const lightMapStyles = [
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

