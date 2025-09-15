// Lightweight walking routing via OSRM public demo (for development).
// For production, use your own OSRM/Valhalla/Mapbox/ORS backend.

export type LatLon = [number, number];

// Base URL for the OSRM backend. Defaults to the public demo server.
const OSRM_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_OSRM_BASE_URL) ||
  'https://router.project-osrm.org';

async function fetchJSONWithRetry(url: string, retries = 2): Promise<any | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
      console.error(`OSRM request failed (${res.status}) for ${url}`);
    } catch (err) {
      console.error(`OSRM request error for ${url}:`, err);
    }
  }
  return null;
}

export async function getWalkingRouteOSRM(from: LatLon, to: LatLon): Promise<LatLon[] | null> {
  const [flat, flon] = from; // [lat, lon]
  const [tlat, tlon] = to;
  const url = `${OSRM_BASE_URL}/route/v1/foot/${flon},${flat};${tlon},${tlat}?overview=full&geometries=geojson`;
  const data = await fetchJSONWithRetry(url);
  if (!data) return null;
  const coords: [number, number][] | undefined = data?.routes?.[0]?.geometry?.coordinates;
  if (!coords || !Array.isArray(coords)) return null;
  // Convert [lon, lat] -> [lat, lon]
  return coords.map(([lon, lat]) => [lat, lon]);
}

export async function getWalkingDistanceOSRM(from: LatLon, to: LatLon): Promise<number | null> {
  const [flat, flon] = from;
  const [tlat, tlon] = to;
  const url = `${OSRM_BASE_URL}/route/v1/foot/${flon},${flat};${tlon},${tlat}?overview=false&alternatives=false&steps=false`;
  const data = await fetchJSONWithRetry(url);
  if (!data) return null;
  const meters: number | undefined = data?.routes?.[0]?.distance;
  return typeof meters === 'number' ? meters : null;
}

const walkCache = new Map<string, number>();

export async function findClosestStopByWalking(point: LatLon, stops: LatLon[], k = 5): Promise<{ index: number; coord: LatLon; distanceMeters: number } | null> {
  if (!stops.length) return null;
  const candidates = stops
    .map((c, i) => ({ i, c }))
    .sort((a, b) => {
      // initial prune by straight-line distance to limit API calls
      const da = Math.hypot(point[0] - a.c[0], point[1] - a.c[1]);
      const db = Math.hypot(point[0] - b.c[0], point[1] - b.c[1]);
      return da - db;
    })
    .slice(0, Math.min(k, stops.length));

  let best: { index: number; coord: LatLon; distanceMeters: number } | null = null;
  for (const cand of candidates) {
    const key = `${point[0].toFixed(5)},${point[1].toFixed(5)}->${cand.i}`;
    let dist = walkCache.get(key) ?? null;
    if (dist == null) {
      dist = await getWalkingDistanceOSRM(point, cand.c);
      if (dist != null) walkCache.set(key, dist);
    }
    if (dist == null) continue;
    if (!best || dist < best.distanceMeters) best = { index: cand.i, coord: cand.c, distanceMeters: dist };
  }

  if (best) return best;
  // Fallback to straight line nearest
  let minI = 0;
  let minD = Infinity;
  stops.forEach((c, i) => {
    const d = (point[0] - c[0]) ** 2 + (point[1] - c[1]) ** 2;
    if (d < minD) {
      minD = d;
      minI = i;
    }
  });
  return { index: minI, coord: stops[minI], distanceMeters: Math.sqrt(minD) };
}
