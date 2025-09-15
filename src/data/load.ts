import type { FeatureCollection } from 'geojson';

export async function loadStops(): Promise<FeatureCollection> {
  const res = await fetch('/data/stops.geo.json');
  if (!res.ok) throw new Error(`Failed to load stops: ${res.status}`);
  return (await res.json()) as FeatureCollection;
}

export async function loadRoutes(): Promise<FeatureCollection> {
  const res = await fetch('/data/routes.geo.json');
  if (!res.ok) throw new Error(`Failed to load routes: ${res.status}`);
  return (await res.json()) as FeatureCollection;
}

