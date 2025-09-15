// Lightweight walking routing via OSRM public demo (for development).
// For production, use your own OSRM/Valhalla/Mapbox/ORS backend.

// Simple promise queue to throttle requests against the OSRM public demo.
// This avoids hammering the free service by limiting concurrent fetches.
class PromiseQueue {
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.active++;
        task()
          .then(resolve, reject)
          .finally(() => {
            this.active--;
            this.dequeue();
          });
      };
      this.queue.push(run);
      this.dequeue();
    });
  }

  private dequeue() {
    if (this.active >= this.limit) return;
    const next = this.queue.shift();
    if (next) next();
  }
}

// Only allow a couple of OSRM requests in flight at a time.
const osrmQueue = new PromiseQueue(2);

function fetchQueued(url: string): Promise<Response> {
  return osrmQueue.enqueue(() => fetch(url));
}

export type LatLon = [number, number];

export async function getWalkingRouteOSRM(from: LatLon, to: LatLon): Promise<LatLon[] | null> {
  const [flat, flon] = from; // [lat, lon]
  const [tlat, tlon] = to;
  const url = `https://router.project-osrm.org/route/v1/foot/${flon},${flat};${tlon},${tlat}?overview=full&geometries=geojson`;
  try {
    const res = await fetchQueued(url);
    if (!res.ok) return null;
    const data = await res.json();
    const coords: [number, number][] | undefined = data?.routes?.[0]?.geometry?.coordinates;
    if (!coords || !Array.isArray(coords)) return null;
    // Convert [lon, lat] -> [lat, lon]
    return coords.map(([lon, lat]) => [lat, lon]);
  } catch {
    return null;
  }
}

export async function getWalkingDistanceOSRM(from: LatLon, to: LatLon): Promise<number | null> {
  const [flat, flon] = from;
  const [tlat, tlon] = to;
  const url = `https://router.project-osrm.org/route/v1/foot/${flon},${flat};${tlon},${tlat}?overview=false&alternatives=false&steps=false`;
  try {
    const res = await fetchQueued(url);
    if (!res.ok) return null;
    const data = await res.json();
    const meters: number | undefined = data?.routes?.[0]?.distance;
    return typeof meters === 'number' ? meters : null;
  } catch {
    return null;
  }
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

  // Measure candidates concurrently; each distance lookup is throttled via osrmQueue.
  const results = await Promise.all(
    candidates.map(async (cand) => {
      const key = `${point[0].toFixed(5)},${point[1].toFixed(5)}->${cand.i}`;
      let dist = walkCache.get(key) ?? null;
      if (dist == null) {
        dist = await getWalkingDistanceOSRM(point, cand.c);
        if (dist != null) walkCache.set(key, dist);
      }
      return { cand, dist };
    })
  );

  let best: { index: number; coord: LatLon; distanceMeters: number } | null = null;
  for (const { cand, dist } of results) {
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
