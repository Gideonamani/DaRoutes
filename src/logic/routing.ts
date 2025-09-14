// Lightweight walking routing via OSRM public demo (for development).
// For production, use your own OSRM/Valhalla/Mapbox/ORS backend.

export type LatLon = [number, number];

export async function getWalkingRouteOSRM(from: LatLon, to: LatLon): Promise<LatLon[] | null> {
  const [flat, flon] = from; // [lat, lon]
  const [tlat, tlon] = to;
  const url = `https://router.project-osrm.org/route/v1/foot/${flon},${flat};${tlon},${tlat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
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

