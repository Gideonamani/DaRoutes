import L from 'leaflet';
import { findClosest, LatLon } from '../logic/snap';

export function wireControls(map: L.Map, stopCoords: LatLon[]) {
  const fromInput = document.getElementById('from') as HTMLInputElement | null;
  const toInput = document.getElementById('to') as HTMLInputElement | null;
  const visualizeBtn = document.getElementById('visualize') as HTMLButtonElement | null;

  const layer = L.layerGroup().addTo(map);

  function parseLatLon(value: string): LatLon | null {
    const parts = value.split(',').map((n) => Number(n.trim()));
    if (parts.length === 2 && parts.every((x) => Number.isFinite(x))) return [parts[0], parts[1]];
    return null;
  }

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
    }
    if (toClosest) {
      L.polyline([toClosest.coord, to], { color: 'orange', dashArray: '4,6' }).addTo(layer);
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

