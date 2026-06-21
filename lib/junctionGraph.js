// junctionGraph.js — builds a weighted graph from dataset junctions for Dijkstra

export function buildJunctionGraph(events) {
  // Collect all junctions with their lat/lng from event data
  const junctionMap = {}; // name -> {lat, lng, incidentCount}

  for (const e of events) {
    if (!e.junction || e.junction.trim() === '') continue;
    const jName = e.junction.trim();
    if (!junctionMap[jName]) {
      junctionMap[jName] = { lat: e.latitude, lng: e.longitude, incidentCount: 0 };
    }
    junctionMap[jName].incidentCount++;
  }

  const junctions = Object.keys(junctionMap);
  const nodes = junctions.map(name => ({ name, ...junctionMap[name] }));

  // Build edges: connect junctions that appear on the same corridor/zone
  // Weight = haversine distance + incident penalty
  const edges = {}; // adjacency list
  for (const n of junctions) edges[n] = [];

  // Connect each junction to its K nearest neighbors (K=3)
  for (let i = 0; i < nodes.length; i++) {
    const distances = nodes
      .map((n, j) => ({ name: n.name, d: haversine(nodes[i], n) }))
      .filter(x => x.name !== nodes[i].name)
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);

    for (const { name, d } of distances) {
      const incidentPenalty = (junctionMap[name].incidentCount || 0) * 50; // 50m per incident
      const weight = d + incidentPenalty;
      edges[nodes[i].name].push({ to: name, weight });
    }
  }

  return { nodes: junctionMap, edges };
}

export function dijkstra(graph, startName, endName, blockedJunctions = []) {
  const { nodes, edges } = graph;
  const dist = {};
  const prev = {};
  const visited = new Set(blockedJunctions);
  const queue = [];

  for (const n in nodes) {
    dist[n] = Infinity;
    prev[n] = null;
  }
  dist[startName] = 0;
  queue.push({ name: startName, d: 0 });

  while (queue.length > 0) {
    queue.sort((a, b) => a.d - b.d);
    const { name: u } = queue.shift();
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === endName) break;

    for (const { to, weight } of (edges[u] || [])) {
      if (visited.has(to)) continue;
      const alt = dist[u] + weight;
      if (alt < dist[to]) {
        dist[to] = alt;
        prev[to] = u;
        queue.push({ name: to, d: alt });
      }
    }
  }

  // Reconstruct path
  const path = [];
  let cur = endName;
  while (cur) {
    path.unshift(cur);
    cur = prev[cur];
  }

  return {
    path,
    totalWeight: dist[endName],
    found: path[0] === startName,
  };
}

function haversine(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat/2) ** 2 +
    Math.cos(a.lat*Math.PI/180) * Math.cos(b.lat*Math.PI/180) * Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
