export type GeoJSONFeatureCollection = {
  type: 'FeatureCollection';
  features: any[];
};

export async function loadStops(): Promise<GeoJSONFeatureCollection> {
  const res = await fetch('/data/stops.geo.json');
  if (!res.ok) throw new Error(`Failed to load stops: ${res.status}`);
  return (await res.json()) as GeoJSONFeatureCollection;
}

export async function loadRoutes(): Promise<GeoJSONFeatureCollection> {
  const res = await fetch('/data/routes.geo.json');
  if (!res.ok) throw new Error(`Failed to load routes: ${res.status}`);
  return (await res.json()) as GeoJSONFeatureCollection;
}

