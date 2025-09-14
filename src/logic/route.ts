import { haversine } from './distance';

export type LatLon = [number, number];

export function extractRoutePolylineFromGeoJSON(collection: any): LatLon[] {
  const result: LatLon[] = [];
  if (!collection || !Array.isArray(collection.features)) return result;
  for (const f of collection.features) {
    const geom = f?.geometry;
    if (!geom) continue;
    if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
      for (const [lon, lat] of geom.coordinates) {
        if (Number.isFinite(lat) && Number.isFinite(lon)) result.push([lat as number, lon as number]);
      }
    } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
      for (const line of geom.coordinates) {
        for (const [lon, lat] of line) {
          if (Number.isFinite(lat) && Number.isFinite(lon)) result.push([lat as number, lon as number]);
        }
      }
    }
  }
  return result;
}

function toMetersXY(refLat: number, p: LatLon): [number, number] {
  const R = 6371e3;
  const latRad = (p[0] * Math.PI) / 180;
  const lonRad = (p[1] * Math.PI) / 180;
  const x = R * lonRad * Math.cos((refLat * Math.PI) / 180);
  const y = R * latRad;
  return [x, y];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function cumulativeDistances(poly: LatLon[]): number[] {
  const acc: number[] = [0];
  for (let i = 1; i < poly.length; i++) {
    acc[i] = acc[i - 1] + haversine(poly[i - 1], poly[i]);
  }
  return acc;
}

export function projectPointToSegment(p: LatLon, a: LatLon, b: LatLon, refLat: number) {
  const pxy = toMetersXY(refLat, p);
  const axy = toMetersXY(refLat, a);
  const bxy = toMetersXY(refLat, b);
  const vx = bxy[0] - axy[0];
  const vy = bxy[1] - axy[1];
  const wx = pxy[0] - axy[0];
  const wy = pxy[1] - axy[1];
  const vv = vx * vx + vy * vy;
  const t = vv > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv)) : 0;
  const projx = axy[0] + t * vx;
  const projy = axy[1] + t * vy;
  const dx = pxy[0] - projx;
  const dy = pxy[1] - projy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const lat = lerp(a[0], b[0], t);
  const lon = lerp(a[1], b[1], t);
  return { t, point: [lat, lon] as LatLon, distance: dist };
}

export function nearestOnPolyline(p: LatLon, poly: LatLon[]) {
  if (poly.length < 2) return null as any;
  const refLat = p[0];
  let best = { segIndex: 0, t: 0, point: poly[0] as LatLon, dist: Infinity };
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const proj = projectPointToSegment(p, a, b, refLat);
    if (proj.distance < best.dist) {
      best = { segIndex: i, t: proj.t, point: proj.point, dist: proj.distance };
    }
  }
  // Compute distance along route to projection
  const cum = cumulativeDistances(poly);
  const segLen = haversine(poly[best.segIndex], poly[best.segIndex + 1]);
  const routeDist = cum[best.segIndex] + best.t * segLen;
  return { ...best, routeDist };
}

export function slicePolylineByDistance(poly: LatLon[], startDist: number, endDist: number): LatLon[] {
  if (poly.length < 2) return [];
  const cum = cumulativeDistances(poly);
  const s = Math.max(0, Math.min(startDist, cum[cum.length - 1]));
  const e = Math.max(0, Math.min(endDist, cum[cum.length - 1]));
  const [from, to] = s <= e ? [s, e] : [e, s];

  const out: LatLon[] = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const segStart = cum[i];
    const segEnd = cum[i + 1];
    const a = poly[i];
    const b = poly[i + 1];
    if (segEnd < from) continue; // before window
    if (segStart > to) break; // after window
    // compute portion overlap
    const segLen = segEnd - segStart;
    const t0 = segLen > 0 ? Math.max(0, Math.min(1, (from - segStart) / segLen)) : 0;
    const t1 = segLen > 0 ? Math.max(0, Math.min(1, (to - segStart) / segLen)) : 0;
    const p0: LatLon = [lerp(a[0], b[0], t0), lerp(a[1], b[1], t0)];
    const p1: LatLon = [lerp(a[0], b[0], t1), lerp(a[1], b[1], t1)];
    if (out.length === 0) out.push(p0);
    out.push(p1);
  }
  return out;
}

