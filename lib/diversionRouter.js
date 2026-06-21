// diversionRouter.js — Dijkstra-first, then ORS for rendering

const ORS_KEY = process.env.NEXT_PUBLIC_ORS_API_KEY;

export async function getDiversionRoutes(startLat, startLng, endLat, endLng) {
  // Call ORS for up to 3 alternative routes
  const url = `https://api.openrouteservice.org/v2/directions/driving-car/geojson`;
  const body = {
    coordinates: [[startLng, startLat], [endLng, endLat]],
    alternative_routes: { share_factor: 0.6, target_count: 3, weight_factor: 1.6 },
    instructions: false,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': ORS_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`ORS error: ${res.status}`);
    const data = await res.json();
    return (data.features || []).map((f, i) => ({
      id: i,
      coordinates: f.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      distance: f.properties.summary.distance,
      duration: f.properties.summary.duration,
    }));
  } catch (e) {
    console.error('ORS API failed:', e);
    return [];
  }
}
