import { haversine } from './distance';

export type LatLon = [number, number];

export function findClosest(point: LatLon, candidates: LatLon[]): { coord: LatLon; index: number; distance: number } | null {
  let best: { coord: LatLon; index: number; distance: number } | null = null;
  candidates.forEach((c, i) => {
    const d = haversine(point, c);
    if (!best || d < best.distance) best = { coord: c, index: i, distance: d };
  });
  return best;
}

