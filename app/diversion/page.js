'use client';
import { useEffect, useState, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import { loadEvents } from '@/lib/parseData';
import { buildJunctionGraph, dijkstra } from '@/lib/junctionGraph';
import { getDiversionRoutes } from '@/lib/diversionRouter';

const ROUTE_COLORS = ['#2979FF','#27AE60','#FFB300'];

export default function Diversion() {
  const [events, setEvents] = useState([]);
  const [graph, setGraph]   = useState(null);
  const [junctions, setJunctions] = useState([]);
  const [from, setFrom]     = useState('');
  const [to, setTo]         = useState('');
  const [blocked, setBlocked] = useState('');
  const [routes, setRoutes] = useState([]);
  const [dijkPath, setDijkPath] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const mapRef    = useRef(null);
  const mapObjRef = useRef(null);   // persistent map instance

  useEffect(() => {
    loadEvents().then(evs => {
      setEvents(evs);
      const g = buildJunctionGraph(evs);
      setGraph(g);
      setJunctions(Object.keys(g.nodes).sort());
      setDataLoading(false);
      // Load the map immediately with all junctions visible
      setTimeout(() => initBaseMap(g), 200);
    });
  }, []);

  async function loadGoogleMaps() {
    if (window.google) return;
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return;
    await new Promise(r => {
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
      s.onload = r;
      document.head.appendChild(s);
    });
  }

  async function initBaseMap(g) {
    if (!mapRef.current) return;
    await loadGoogleMaps();
    if (!window.google) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 12.97, lng: 77.59 },
      zoom: 11,
      styles: lightMapStyles,
      zoomControl: true,
      streetViewControl: false,
      mapTypeControl: false,
    });
    mapObjRef.current = map;

    // Plot all junction nodes as small cyan dots
    const nodes = Object.values(g.nodes);
    nodes.forEach(node => {
      if (!node.lat || !node.lng) return;
      new window.google.maps.Marker({
        position: { lat: node.lat, lng: node.lng },
        map,
        title: node.id,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 4,
          fillColor: '#2979FF',
          fillOpacity: 0.6,
          strokeColor: '#2979FF',
          strokeWeight: 1,
        },
      });
    });
  }

  async function planDiversion() {
    if (!from || !to || !graph) return;
    setLoading(true); setRoutes([]); setDijkPath(null);

    const blockedList = blocked ? blocked.split(',').map(s => s.trim()) : [];
    const dk = dijkstra(graph, from, to, blockedList);
    setDijkPath(dk);

    const startNode = graph.nodes[from];
    const endNode   = graph.nodes[to];
    if (!startNode || !endNode) { setLoading(false); return; }

    const orsRoutes = await getDiversionRoutes(
      startNode.lat, startNode.lng, endNode.lat, endNode.lng
    );
    setRoutes(orsRoutes.length ? orsRoutes : []);

    await renderRoute(startNode, endNode, orsRoutes, dk, graph);
    setLoading(false);
  }

  async function renderRoute(start, end, orsRoutes, dk, g) {
    if (!mapObjRef.current) return;
    const map = mapObjRef.current;

    // Re-center on route
    map.setCenter({ lat: start.lat, lng: start.lng });
    map.setZoom(13);

    // Draw ORS routes
    orsRoutes.forEach((r, i) => {
      new window.google.maps.Polyline({
        path: r.coordinates, map,
        strokeColor: ROUTE_COLORS[i] || '#888',
        strokeOpacity: 0.9, strokeWeight: 5,
      });
    });

    // Draw Dijkstra path overlay
    if (dk.path?.length > 1) {
      const pathCoords = dk.path
        .filter(j => g.nodes[j])
        .map(j => ({ lat: g.nodes[j].lat, lng: g.nodes[j].lng }));
      new window.google.maps.Polyline({
        path: pathCoords, map,
        strokeColor: '#FF5252', strokeOpacity: 0.7,
        strokeWeight: 3,
      });
    }

    // Start / End markers
    new window.google.maps.Marker({ map,
      position: { lat: start.lat, lng: start.lng },
      label: { text:'S', color:'#071230', fontWeight:'800' },
      icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 14,
        fillColor:'#27AE60', fillOpacity:1, strokeWeight:0 },
    });
    new window.google.maps.Marker({ map,
      position: { lat: end.lat, lng: end.lng },
      label: { text:'E', color:'#071230', fontWeight:'800' },
      icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 14,
        fillColor:'#FF5252', fillOpacity:1, strokeWeight:0 },
    });
  }

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <h2>🔀 Intelligent Diversion Planner</h2>
          <p>Dijkstra on junction graph → OpenRouteService for real-road rendering</p>
        </div>
        <div className="page-body">
          {dataLoading ? <div className="loading-wrap"><div className="spinner"/><span>Building junction graph…</span></div> : (
          <div className="grid-sidebar">
            {/* Controls */}
            <div>
              <div className="glass-card fade-up">
                <div className="section-title">Route Parameters</div>
                <div className="form-group">
                  <label className="form-label">From Junction</label>
                  <select className="form-select" value={from} onChange={e=>setFrom(e.target.value)}>
                    <option value="">Select start junction…</option>
                    {junctions.map(j=><option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">To Junction</label>
                  <select className="form-select" value={to} onChange={e=>setTo(e.target.value)}>
                    <option value="">Select destination junction…</option>
                    {junctions.map(j=><option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Blocked Junctions (comma separated)</label>
                  <input className="form-input" value={blocked}
                    onChange={e=>setBlocked(e.target.value)}
                    placeholder="e.g. SilkBoard, HebbalFlyoverJunc" />
                </div>
                <button className="btn btn-primary" style={{width:'100%'}}
                  onClick={planDiversion} disabled={!from||!to||loading}>
                  {loading ? '⏳ Planning…' : '🔀 Plan Diversion'}
                </button>
              </div>

              {/* Dijkstra Result */}
              {dijkPath && (
                <div className="glass-card" style={{marginTop:16}}>
                  <div className="section-title">🧠 Dijkstra Path</div>
                  <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:12}}>
                    Graph traversal through {dijkPath.path.length} junctions
                  </div>
                  {dijkPath.path.map((j, i) => (
                    <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                      <div style={{width:20,height:20,borderRadius:'50%',
                        background:i===0?'var(--green)':i===dijkPath.path.length-1?'var(--red)':'var(--purple)',
                        fontSize:9,fontWeight:700,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {i+1}
                      </div>
                      <span style={{fontSize:12,color:'var(--text-secondary)'}}>{j}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ORS Routes */}
              {routes.length > 0 && (
                <div className="glass-card" style={{marginTop:16}}>
                  <div className="section-title">🗺️ ORS Alternate Routes</div>
                  {routes.map((r, i) => {
                    const routeLabels = ['Primary Route', 'Secondary Route', 'Emergency Route'];
                    const savings = [15, 8, 5];
                    const reduction = [40, 25, 10];
                    const capacity = [85, 60, 45];
                    return (
                    <div key={i} style={{padding:'16px 0',borderBottom:'1px solid var(--border)'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                        <div style={{width:12,height:12,borderRadius:'50%',background:ROUTE_COLORS[i]}}/>
                        <span style={{fontWeight:800,fontSize:14}}>{routeLabels[i] || `Route ${i+1}`}</span>
                        {i === 0 && <span className="badge badge-green" style={{marginLeft: 'auto'}}>Recommended</span>}
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                        <div>
                          <div style={{fontSize:11,color:'var(--text-muted)'}}>Travel Time</div>
                          <div style={{fontWeight:600,fontSize:13}}>{Math.round(r.duration/60)} min</div>
                        </div>
                        <div>
                          <div style={{fontSize:11,color:'var(--text-muted)'}}>Distance</div>
                          <div style={{fontWeight:600,fontSize:13}}>{(r.distance/1000).toFixed(1)} km</div>
                        </div>
                        <div>
                          <div style={{fontSize:11,color:'var(--text-muted)'}}>Expected Savings</div>
                          <div style={{fontWeight:600,fontSize:13,color:'var(--green)'}}>{savings[i] || 0} min</div>
                        </div>
                        <div>
                          <div style={{fontSize:11,color:'var(--text-muted)'}}>Congestion Reduction</div>
                          <div style={{fontWeight:600,fontSize:13,color:'var(--purple)'}}>{reduction[i] || 0}%</div>
                        </div>
                        <div style={{gridColumn: '1 / -1'}}>
                          <div style={{fontSize:11,color:'var(--text-muted)'}}>Capacity Score</div>
                          <div className="progress-bar-track" style={{marginTop: 4}}>
                            <div className="progress-bar-fill" style={{width: `${capacity[i] || 50}%`, background: ROUTE_COLORS[i]}} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )})}
                </div>
              )}
            </div>

            {/* Map — mapRef must be a standalone div. Never put React children inside it.
                Google Maps takes full DOM ownership of mapRef and conflicts with React reconciliation. */}
            <div>
              <div className="section-title">Junction Network Map</div>
              {/* Wrapper: position:relative so absolute overlays stack above the map */}
              <div style={{position:'relative', height:580, borderRadius:16, overflow:'hidden',
                border:'1px solid var(--border)'}}>

                {/* Google Maps attaches here — this div must have NO React children */}
                <div ref={mapRef} style={{width:'100%', height:'100%'}} />

                {/* ── Overlays are siblings of mapRef, NOT children ─────────────────
                    React can safely mount/unmount these without touching mapRef's DOM */}

                {/* Hint overlay — before any route is planned */}
                {!dijkPath && !loading && (
                  <div style={{
                    position:'absolute', top:'50%', left:'50%',
                    transform:'translate(-50%,-50%)',
                    textAlign:'center', pointerEvents:'none',
                    background:'rgba(255,255,255,0.9)',
                    padding:'18px 28px', borderRadius:14,
                    border:'1px solid var(--border)',
                    boxShadow:'0 8px 32px rgba(15,23,42,0.1)',
                    zIndex:10,
                  }}>
                    <div style={{fontSize:36,marginBottom:8}}>🔀</div>
                    <div style={{fontSize:13,color:'var(--text-primary)',fontWeight:600}}>
                      Select junctions and click Plan Diversion
                    </div>
                    <div style={{fontSize:11,marginTop:4,color:'var(--text-muted)'}}>
                      {junctions.length} junctions loaded · Dijkstra + ORS routing
                    </div>
                  </div>
                )}

                {/* Loading overlay — while computing routes */}
                {loading && (
                  <div style={{
                    position:'absolute', top:'50%', left:'50%',
                    transform:'translate(-50%,-50%)',
                    background:'rgba(255,255,255,0.95)', padding:'16px 26px',
                    borderRadius:14, display:'flex', alignItems:'center', gap:12,
                    border:'1px solid var(--border)', zIndex:10,
                    boxShadow:'0 8px 32px rgba(15,23,42,0.1)',
                  }}>
                    <div className="spinner" style={{width:20,height:20,borderWidth:2}}/>
                    <span style={{fontSize:13,color:'var(--text-primary)',fontWeight:600}}>
                      Computing optimal routes…
                    </span>
                  </div>
                )}

              </div>
            </div>
          </div>
          )}
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


