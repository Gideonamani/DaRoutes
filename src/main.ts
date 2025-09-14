import L from 'leaflet';
import { initMap } from './map/initMap';
import { loadRoutes, loadStops } from './data/load';
import { wireControls } from './ui/controls';
import './styles.css';

async function bootstrap() {
  const map = initMap();

  // Load data
  try {
    const [routes, stops] = await Promise.all([loadRoutes(), loadStops()]);

    // Render routes
    const routeLayer = L.geoJSON(routes as any, {
      style: { color: '#2c7fb8', weight: 4 },
    }).addTo(map);

    // Render stops
    const stopLayer = L.geoJSON(stops as any, {
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, { radius: 5, color: '#cc0000' }),
      onEachFeature: (feature, layer) => {
        const name = feature?.properties?.name ?? 'Stop';
        layer.bindPopup(`<div class="stop-popup">${name}</div>`);
      },
    }).addTo(map);

    // Fit bounds to routes or stops
    const bounds = routeLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds);
    }

    // Build a lightweight list of stop coords for snapping
    const stopCoords = (stops.features || [])
      .map((f: any) => (Array.isArray(f.geometry?.coordinates) ? [f.geometry.coordinates[1], f.geometry.coordinates[0]] : null))
      .filter(Boolean) as [number, number][];

    wireControls(map, stopCoords);
  } catch (err) {
    console.error('Error initializing app:', err);
  }
}

bootstrap();

