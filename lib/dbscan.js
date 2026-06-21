// dbscan.js — DBSCAN clustering with grid-index acceleration
// Haversine distance kept but pre-binned via a spatial grid for O(n) instead of O(n²)

function haversine(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat/2) ** 2 +
    Math.cos(a.lat * Math.PI/180) * Math.cos(b.lat * Math.PI/180) * Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Build spatial grid so rangeQuery is O(k) not O(n)
function buildGrid(points, eps) {
  const cellSize = eps / 111320; // degrees per cell (approx at Bengaluru lat)
  const grid = new Map();
  const cellKey = (lat, lng) =>
    `${Math.floor(lat / cellSize)}_${Math.floor(lng / cellSize)}`;

  points.forEach((p, i) => {
    const k = cellKey(p.lat, p.lng);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });

  return { grid, cellSize, cellKey };
}

function rangeQuery(points, idx, eps, gridInfo) {
  const { grid, cellSize, cellKey } = gridInfo;
  const p = points[idx];
  const ci = Math.floor(p.lat / cellSize);
  const cj = Math.floor(p.lng / cellSize);
  const candidates = [];

  for (let di = -2; di <= 2; di++) {
    for (let dj = -2; dj <= 2; dj++) {
      const k = `${ci + di}_${cj + dj}`;
      if (grid.has(k)) candidates.push(...grid.get(k));
    }
  }

  return candidates.filter(j => haversine(p, points[j]) <= eps);
}

// Uniform sub-sample to cap cost on large datasets
function subsample(points, max = 3000) {
  if (points.length <= max) return points;
  const step = points.length / max;
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

export function dbscan(allPoints, eps = 500, minPts = 5) {
  // Sub-sample so DBSCAN runs in <500ms even on 8000+ points
  const points = subsample(allPoints, 3000);
  const n = points.length;
  const labels = new Int8Array(n).fill(-1); // -1 = unvisited
  const gridInfo = buildGrid(points, eps);
  let clusterId = 0;

  for (let i = 0; i < n; i++) {
    if (labels[i] !== -1) continue;
    const neighbors = rangeQuery(points, i, eps, gridInfo);
    if (neighbors.length < minPts) { labels[i] = 0; continue; } // noise

    clusterId++;
    labels[i] = clusterId;
    const seed = new Set(neighbors.filter(j => j !== i));

    for (const j of seed) {
      if (labels[j] === 0) labels[j] = clusterId;
      if (labels[j] !== -1) continue;
      labels[j] = clusterId;
      const jN = rangeQuery(points, j, eps, gridInfo);
      if (jN.length >= minPts) jN.forEach(n => seed.add(n));
    }
  }

  // Aggregate clusters
  const map = {};
  for (let i = 0; i < n; i++) {
    const c = labels[i];
    if (c > 0) {
      if (!map[c]) map[c] = { latSum: 0, lngSum: 0, count: 0 };
      map[c].latSum += points[i].lat;
      map[c].lngSum += points[i].lng;
      map[c].count++;
    }
  }

  return Object.values(map)
    .map(({ latSum, lngSum, count }) => ({ lat: latSum/count, lng: lngSum/count, count }))
    .sort((a, b) => b.count - a.count);
}

// Async wrapper — yields to browser between ticks so UI stays live
export function dbscanAsync(allPoints, eps, minPts) {
  return new Promise(resolve =>
    setTimeout(() => resolve(dbscan(allPoints, eps, minPts)), 0)
  );
}
