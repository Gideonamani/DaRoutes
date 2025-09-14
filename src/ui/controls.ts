import L from 'leaflet';
import { findClosest, LatLon } from '../logic/snap';
import { nearestOnPolyline, slicePolylineByDistance } from '../logic/route';
import { haversine } from '../logic/distance';

type StopItem = { coord: LatLon; name: string };

export function wireControls(map: L.Map, stops: StopItem[], routePolyline: LatLon[]) {
  const stopCoords: LatLon[] = stops.map((s) => s.coord);
  const fromInput = document.getElementById('from') as HTMLInputElement | null;
  const toInput = document.getElementById('to') as HTMLInputElement | null;
  const visualizeBtn = document.getElementById('visualize') as HTMLButtonElement | null;
  const clearBtn = document.getElementById('clear') as HTMLButtonElement | null;
  const summary = document.getElementById('summary') as HTMLDivElement | null;

  const layer = L.layerGroup().addTo(map); // results layer
  const pickLayer = L.layerGroup().addTo(map); // picker markers

  let activeField: 'from' | 'to' | null = null;
  let fromMarker: L.Marker | null = null;
  let toMarker: L.Marker | null = null;
  let boardMarker: L.CircleMarker | null = null;
  let alightMarker: L.CircleMarker | null = null;

  function parseLatLon(value: string): LatLon | null {
    const parts = value.split(',').map((n) => Number(n.trim()));
    if (parts.length === 2 && parts.every((x) => Number.isFinite(x))) return [parts[0], parts[1]];
    return null;
  }

  function setCursorPicking(on: boolean) {
    const el = map.getContainer();
    el.style.cursor = on ? 'crosshair' : '';
  }

  // Focus/blur to enable map picking
  fromInput?.addEventListener('focus', () => {
    activeField = 'from';
    setCursorPicking(true);
  });
  toInput?.addEventListener('focus', () => {
    activeField = 'to';
    setCursorPicking(true);
  });
  // Allow blur without canceling pick; user can click the map next
  // Provide ESC to cancel instead
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      activeField = null;
      setCursorPicking(false);
    }
  });

  // Clicking on map fills the focused input and drops a draggable marker
  map.on('click', (e: L.LeafletMouseEvent) => {
    if (!activeField) return;
    const lat = +e.latlng.lat.toFixed(6);
    const lng = +e.latlng.lng.toFixed(6);
    const text = `${lat}, ${lng}`;

    if (activeField === 'from' && fromInput) {
      fromInput.value = text;
      if (fromMarker) {
        fromMarker.setLatLng([lat, lng]);
      } else {
        fromMarker = L.marker([lat, lng], { draggable: true }).addTo(pickLayer).bindPopup('From');
        fromMarker.on('dragend', () => {
          const pos = (fromMarker as L.Marker).getLatLng();
          fromInput.value = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
        });
      }
    }

    if (activeField === 'to' && toInput) {
      toInput.value = text;
      if (toMarker) {
        toMarker.setLatLng([lat, lng]);
      } else {
        toMarker = L.marker([lat, lng], { draggable: true }).addTo(pickLayer).bindPopup('To');
        toMarker.on('dragend', () => {
          const pos = (toMarker as L.Marker).getLatLng();
          toInput.value = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
        });
      }
    }

    // After a successful pick, stop picking mode until user focuses an input again
    activeField = null;
    setCursorPicking(false);
  });

  function clearAll() {
    layer.clearLayers();
    pickLayer.clearLayers();
    fromMarker = null;
    toMarker = null;
    boardMarker = null;
    alightMarker = null;
    if (fromInput) fromInput.value = '';
    if (toInput) toInput.value = '';
    if (summary) summary.textContent = '';
  }

  clearBtn?.addEventListener('click', () => {
    clearAll();
  });

  visualizeBtn?.addEventListener('click', () => {
    layer.clearLayers();

    const from = fromInput ? parseLatLon(fromInput.value) : null;
    const to = toInput ? parseLatLon(toInput.value) : null;
    if (!from || !to) {
      alert('Please enter valid coordinates for From and To.');
      return;
    }

    const fromClosest = findClosest(from, stopCoords);
    const toClosest = findClosest(to, stopCoords);

    // Markers
    L.marker(from).addTo(layer).bindPopup('From');
    L.marker(to).addTo(layer).bindPopup('To');

    if (fromClosest) {
      L.polyline([from, fromClosest.coord], { color: 'orange', dashArray: '4,6' }).addTo(layer);
      boardMarker = L.circleMarker(fromClosest.coord, { radius: 7, color: '#2e7d32', fillColor: '#2e7d32', fillOpacity: 0.9 }).addTo(layer);
      boardMarker.bindPopup(`Board: ${stops[fromClosest.index]?.name ?? 'Stop'}`);
    }
    if (toClosest) {
      L.polyline([toClosest.coord, to], { color: 'orange', dashArray: '4,6' }).addTo(layer);
      alightMarker = L.circleMarker(toClosest.coord, { radius: 7, color: '#6a1b9a', fillColor: '#6a1b9a', fillOpacity: 0.9 }).addTo(layer);
      alightMarker.bindPopup(`Alight: ${stops[toClosest.index]?.name ?? 'Stop'}`);
    }

    // Route subpath between snapped stops (project both stops onto the route polyline)
    if (routePolyline.length >= 2 && fromClosest && toClosest) {
      const a = nearestOnPolyline(fromClosest.coord, routePolyline);
      const b = nearestOnPolyline(toClosest.coord, routePolyline);
      if (a && b) {
        const segment = slicePolylineByDistance(routePolyline, a.routeDist, b.routeDist);
        if (segment.length > 1) {
          L.polyline(segment, { color: '#2c7fb8', weight: 5 }).addTo(layer);
          const distanceMeters = Math.abs(b.routeDist - a.routeDist);
          const boardName = stops[fromClosest.index]?.name ?? 'Stop';
          const alightName = stops[toClosest.index]?.name ?? 'Stop';
          if (summary) summary.textContent = `Board at ${boardName} → Alight at ${alightName} • ~${(distanceMeters/1000).toFixed(2)} km`;
        }
      }
    }

    const bounds = L.latLngBounds([
      L.latLng(from[0], from[1]),
      L.latLng(to[0], to[1]),
      ...(fromClosest ? [L.latLng(fromClosest.coord[0], fromClosest.coord[1])] : []),
      ...(toClosest ? [L.latLng(toClosest.coord[0], toClosest.coord[1])] : []),
    ]);
    map.fitBounds(bounds, { padding: [40, 40] });
  });
}
