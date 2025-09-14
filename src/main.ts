import L from 'leaflet';
import { initMap } from './map/initMap';
import { loadRoutes, loadStops } from './data/load';
import { wireControls } from './ui/controls';
import { extractRoutePolylineFromGeoJSON } from './logic/route';
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
    const controlAPIPlaceholder: { setPoint?: (which: 'from'|'to', coord: [number, number]) => void } = {};
    const stopLayer = L.geoJSON(stops as any, {
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, { radius: 5, color: '#cc0000' }),
      onEachFeature: (feature, layer: any) => {
        const name = feature?.properties?.name ?? 'Stop';
        const coords = feature?.geometry?.coordinates as [number, number];
        const coordLatLon: [number, number] = [coords[1], coords[0]];
        const popupHtml = `<div class="stop-popup"><strong>${name}</strong><div style="margin-top:6px;display:flex;gap:6px;">`+
          `<button type="button" class="btn mini" data-role="set-from">Set as From</button>`+
          `<button type="button" class="btn mini" data-role="set-to">Set as To</button>`+
          `</div></div>`;
        layer.bindPopup(popupHtml);
        layer.on('click', () => {
          const activeId = (document.activeElement && (document.activeElement as HTMLElement).id) || '';
          if (activeId === 'from' && controlAPIPlaceholder.setPoint) {
            controlAPIPlaceholder.setPoint('from', coordLatLon);
          } else if (activeId === 'to' && controlAPIPlaceholder.setPoint) {
            controlAPIPlaceholder.setPoint('to', coordLatLon);
          } else if (layer.openPopup) {
            layer.openPopup();
          }
        });
        layer.on('popupopen', (e: any) => {
          const container = e.popup.getElement() as HTMLElement;
          if ((L as any).DomEvent?.disableClickPropagation) {
            (L as any).DomEvent.disableClickPropagation(container);
          }
          setTimeout(() => {
            const fromBtn = container.querySelector('[data-role="set-from"]') as HTMLButtonElement | null;
            const toBtn = container.querySelector('[data-role="set-to"]') as HTMLButtonElement | null;
            fromBtn?.addEventListener('click', (ev) => { ev.preventDefault(); controlAPIPlaceholder.setPoint && controlAPIPlaceholder.setPoint('from', coordLatLon); (layer as any).closePopup && (layer as any).closePopup(); });
            toBtn?.addEventListener('click', (ev) => { ev.preventDefault(); controlAPIPlaceholder.setPoint && controlAPIPlaceholder.setPoint('to', coordLatLon); (layer as any).closePopup && (layer as any).closePopup(); });
          }, 0);
        });
      },
    }).addTo(map);

    // Fit bounds to routes or stops
    const bounds = routeLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds);
    }

    // Build a list of stops with coords and names
    const stopsList = (stops.features || [])
      .map((f: any) => {
        if (!Array.isArray(f.geometry?.coordinates)) return null;
        const [lon, lat] = f.geometry.coordinates;
        const name = f?.properties?.name ?? 'Stop';
        return { coord: [lat, lon] as [number, number], name };
      })
      .filter(Boolean) as { coord: [number, number]; name: string }[];

    const routePolyline = extractRoutePolylineFromGeoJSON(routes);

    const controlsAPI = wireControls(map, stopsList, routePolyline);
    controlAPIPlaceholder.setPoint = controlsAPI.setPoint;
  } catch (err) {
    console.error('Error initializing app:', err);
  }
}

bootstrap();
