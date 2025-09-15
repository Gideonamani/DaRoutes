import L from 'leaflet';
import { LatLon, findClosest } from '../logic/snap';
import { nearestOnPolyline, slicePolylineByDistance } from '../logic/route';
import { haversine } from '../logic/distance';
import { getWalkingRouteOSRM, findClosestStopByWalking } from '../logic/routing';

type StopItem = { coord: LatLon; name: string };

export function wireControls(map: L.Map, stops: StopItem[], routePolyline: LatLon[]) {
  const stopCoords: LatLon[] = stops.map((s) => s.coord);
  const fromInput = document.getElementById('from') as HTMLInputElement | null;
  const toInput = document.getElementById('to') as HTMLInputElement | null;
  const visualizeBtn = document.getElementById('visualize') as HTMLButtonElement | null;
  const clearBtn = document.getElementById('clear') as HTMLButtonElement | null;
  const nearestMode = document.getElementById('nearest-mode') as HTMLSelectElement | null;
  const summary = document.getElementById('summary') as HTMLDivElement | null;
  const spinner = document.getElementById('spinner') as HTMLSpanElement | null;
  const playToggle = document.getElementById('play-toggle') as HTMLButtonElement | null;
  const speedInput = document.getElementById('speed') as HTMLInputElement | null;

  const layer = L.layerGroup().addTo(map); // results layer
  const pickLayer = L.layerGroup().addTo(map); // picker markers
  const decorLayer = L.layerGroup().addTo(map); // chevrons, labels, progress

  let activeField: 'from' | 'to' | null = null;
  let fromMarker: L.Marker | null = null;
  let toMarker: L.Marker | null = null;
  let boardMarker: L.CircleMarker | null = null;
  let alightMarker: L.CircleMarker | null = null;
  let boardPulse: L.Marker | null = null;
  let alightPulse: L.Marker | null = null;
  let boardChip: L.Marker | null = null;
  let alightChip: L.Marker | null = null;

  // Animation state
  let busMarker: L.Marker | null = null;
  let segmentPoints: LatLon[] = [];
  let segmentCum: number[] = [];
  let totalLen = 0; // meters
  let progress = 0; // meters along
  let playing = false;
  let rafId: number | null = null;
  let lastTs = 0;
  const busIcon = L.divIcon({ className: 'bus-icon', html: '🚌', iconSize: [28, 28], iconAnchor: [14, 14] });
  const pulseGreen = L.divIcon({ className: 'pulse', html: '', iconSize: [12,12], iconAnchor: [6,6] });
  const pulsePurple = L.divIcon({ className: 'pulse pulse-purple', html: '', iconSize: [12,12], iconAnchor: [6,6] });
  const chip = (text: string) => L.divIcon({ className: 'chip', html: text, iconSize: [60,20], iconAnchor: [30, 22] });
  let progressLine: L.Polyline | null = null;
  let chevrons: L.Marker[] = [];

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

  function setPoint(which: 'from'|'to', coord: LatLon) {
    const [lat, lng] = coord;
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    if (which === 'from' && fromInput) {
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
    if (which === 'to' && toInput) {
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
  }

  // Clicking on map fills the focused input and drops a draggable marker
  map.on('click', (e: L.LeafletMouseEvent) => {
    if (!activeField) return;
    const lat = +e.latlng.lat.toFixed(6);
    const lng = +e.latlng.lng.toFixed(6);
    setPoint(activeField, [lat, lng]);

    // After a successful pick, stop picking mode until user focuses an input again
    activeField = null;
    setCursorPicking(false);
  });

  function clearAll() {
    layer.clearLayers();
    pickLayer.clearLayers();
    decorLayer.clearLayers();
    fromMarker = null;
    toMarker = null;
    boardMarker = null;
    alightMarker = null;
    boardPulse = null; alightPulse = null;
    boardChip = null; alightChip = null;
    stopAnimation();
    busMarker = null;
    segmentPoints = [];
    segmentCum = [];
    totalLen = 0;
    progress = 0;
    if (playToggle) { playToggle.disabled = true; playToggle.textContent = '▶ Play'; }
    if (fromInput) fromInput.value = '';
    if (toInput) toInput.value = '';
    if (summary) summary.textContent = '';
    if (spinner) spinner.classList.add('hidden');
  }

  clearBtn?.addEventListener('click', () => {
    clearAll();
  });

  function stopAnimation() {
    playing = false;
    if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    lastTs = 0;
    if (playToggle) playToggle.textContent = '▶ Play';
  }

  function pointAtDistance(poly: LatLon[], cum: number[], dist: number): LatLon {
    if (poly.length === 0) return [0, 0];
    if (dist <= 0) return poly[0];
    const total = cum[cum.length - 1] ?? 0;
    if (dist >= total) return poly[poly.length - 1];
    // binary search for segment
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (cum[mid] < dist) lo = mid + 1; else hi = mid;
    }
    const i = Math.max(1, lo);
    const segStart = cum[i - 1];
    const segEnd = cum[i];
    const t = segEnd === segStart ? 0 : (dist - segStart) / (segEnd - segStart);
    const a = poly[i - 1];
    const b = poly[i];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  function startAnimation() {
    if (!segmentPoints.length || totalLen <= 0) return;
    if (!busMarker) {
      busMarker = L.marker(segmentPoints[0], { icon: busIcon }).addTo(layer);
    }
    playing = true;
    if (playToggle) playToggle.textContent = '⏸ Pause';
    lastTs = 0;
    const step = (ts: number) => {
      if (!playing) return;
      if (lastTs === 0) lastTs = ts;
      const dt = (ts - lastTs) / 1000; // seconds
      lastTs = ts;
      const speed = speedInput ? Number(speedInput.value) : 10; // m/s
      progress += Math.max(0, speed) * dt;
      if (progress >= totalLen) {
        progress = totalLen;
        const pos = pointAtDistance(segmentPoints, segmentCum, progress);
        busMarker!.setLatLng(pos);
        stopAnimation();
        if (playToggle) playToggle.textContent = '↺ Replay';
        return;
      }
      const pos = pointAtDistance(segmentPoints, segmentCum, progress);
      busMarker!.setLatLng(pos);
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  }

  visualizeBtn?.addEventListener('click', async () => {
    layer.clearLayers();
    stopAnimation();
    busMarker = null;
    segmentPoints = [];
    segmentCum = [];
    totalLen = 0;
    progress = 0;
    if (playToggle) { playToggle.disabled = true; playToggle.textContent = '▶ Play'; }

    const from = fromInput ? parseLatLon(fromInput.value) : null;
    const to = toInput ? parseLatLon(toInput.value) : null;
    if (!from || !to) {
      alert('Please enter valid coordinates for From and To.');
      return;
    }

    // Mode: walking vs straight-line
    const mode = nearestMode?.value === 'straight' ? 'straight' : 'walking';
    if (spinner) spinner.classList.remove('hidden');
    const fromClosest = mode === 'walking'
      ? await findClosestStopByWalking(from, stopCoords, 6)
      : (() => {
          const r = findClosest(from, stopCoords);
          return r && { index: r.index, coord: r.coord, distanceMeters: null as number | null };
        })();
    const toClosest = mode === 'walking'
      ? await findClosestStopByWalking(to, stopCoords, 6)
      : (() => {
          const r = findClosest(to, stopCoords);
          return r && { index: r.index, coord: r.coord, distanceMeters: null as number | null };
        })();

    // Markers
    L.marker(from).addTo(layer).bindPopup('From');
    L.marker(to).addTo(layer).bindPopup('To');

    if (summary) summary.textContent = mode === 'walking' ? 'Finding walking paths…' : 'Drawing access paths…';

    // Draw access path (from -> board stop)
    if (fromClosest) {
      if (mode === 'walking') {
        const walk1 = await getWalkingRouteOSRM(from, fromClosest.coord);
        if (walk1 && walk1.length > 1) {
          L.polyline(walk1, { color: '#f39c12', weight: 4, opacity: 0.9 }).addTo(layer);
        } else {
          L.polyline([from, fromClosest.coord], { color: '#f39c12', dashArray: '4,6' }).addTo(layer);
        }
      } else {
        L.polyline([from, fromClosest.coord], { color: '#f39c12', dashArray: '4,6' }).addTo(layer);
      }
      boardMarker = L.circleMarker(fromClosest.coord, { radius: 6, color: '#2e7d32', fillColor: '#2e7d32', fillOpacity: 1 }).addTo(layer);
      boardPulse = L.marker(fromClosest.coord, { icon: pulseGreen }).addTo(decorLayer);
      boardChip = L.marker(fromClosest.coord, { icon: chip(`Board: ${stops[fromClosest.index]?.name ?? 'Stop'}`) }).addTo(decorLayer);
    }

    // Draw egress path (alight stop -> to)
    if (toClosest) {
      if (mode === 'walking') {
        const walk2 = await getWalkingRouteOSRM(toClosest.coord, to);
        if (walk2 && walk2.length > 1) {
          L.polyline(walk2, { color: '#8e44ad', weight: 4, opacity: 0.9 }).addTo(layer);
        } else {
          L.polyline([toClosest.coord, to], { color: '#8e44ad', dashArray: '4,6' }).addTo(layer);
        }
      } else {
        L.polyline([toClosest.coord, to], { color: '#8e44ad', dashArray: '4,6' }).addTo(layer);
      }
      alightMarker = L.circleMarker(toClosest.coord, { radius: 6, color: '#6a1b9a', fillColor: '#6a1b9a', fillOpacity: 1 }).addTo(layer);
      alightPulse = L.marker(toClosest.coord, { icon: pulsePurple }).addTo(decorLayer);
      alightChip = L.marker(toClosest.coord, { icon: chip(`Alight: ${stops[toClosest.index]?.name ?? 'Stop'}`) }).addTo(decorLayer);
    }

    // Route subpath between snapped stops (project both stops onto the route polyline)
    if (routePolyline.length >= 2 && fromClosest && toClosest) {
      const a = nearestOnPolyline(fromClosest.coord, routePolyline);
      const b = nearestOnPolyline(toClosest.coord, routePolyline);
      if (a && b) {
        const segment = slicePolylineByDistance(routePolyline, a.routeDist, b.routeDist);
        if (segment.length > 1) {
          // Base route
          L.polyline(segment, { color: '#2c7fb8', weight: 4, opacity: 0.5 }).addTo(layer);
          // Progress overlay
          progressLine = L.polyline([segment[0]], { color: '#2c7fb8', weight: 6 }).addTo(decorLayer);
          const busMeters = Math.abs(b.routeDist - a.routeDist);
          const boardName = stops[fromClosest.index]?.name ?? 'Stop';
          const alightName = stops[toClosest.index]?.name ?? 'Stop';
          const accessMeters = mode === 'walking'
            ? fromClosest?.distanceMeters ?? undefined
            : fromClosest
            ? haversine(from, fromClosest.coord)
            : undefined;
          const egressMeters = mode === 'walking'
            ? toClosest?.distanceMeters ?? undefined
            : toClosest
            ? haversine(toClosest.coord, to)
            : undefined;
          const aKm = accessMeters != null ? (accessMeters / 1000).toFixed(2) : '—';
          const bKm = (busMeters / 1000).toFixed(2);
          const eKm = egressMeters != null ? (egressMeters / 1000).toFixed(2) : '—';
          if (summary) summary.textContent = `Board at ${boardName} → Alight at ${alightName} • Walk ~${aKm} km + Bus ~${bKm} km + Walk ~${eKm} km`;

          // Prepare animation
          segmentPoints = segment;
          // build cumulative distances
          segmentCum = [0];
          for (let i = 1; i < segmentPoints.length; i++) {
            segmentCum[i] = segmentCum[i - 1] + haversine(segmentPoints[i - 1], segmentPoints[i]);
          }
          totalLen = segmentCum[segmentCum.length - 1] ?? 0;
          progress = 0;
          if (!busMarker) {
            busMarker = L.marker(segmentPoints[0], { icon: busIcon }).addTo(layer);
          } else {
            busMarker.setLatLng(segmentPoints[0]);
          }
          if (playToggle) { playToggle.disabled = totalLen <= 0; playToggle.textContent = '▶ Play'; }

          // Direction chevrons along the route
          chevrons.forEach(m => decorLayer.removeLayer(m));
          chevrons = [];
          const step = Math.max(200, Math.floor(totalLen / 12));
          for (let d = step; d < totalLen; d += step) {
            const p = pointAtDistance(segmentPoints, segmentCum, d);
            const pAhead = pointAtDistance(segmentPoints, segmentCum, Math.min(totalLen, d + 5));
            const angle = Math.atan2(pAhead[0] - p[0], pAhead[1] - p[1]) * 180 / Math.PI; // deg
            const icon = L.divIcon({ className: 'chevron', html: `<div style="transform: rotate(${ -angle }deg)">➤</div>`, iconSize: [14,14], iconAnchor: [7,7] });
            chevrons.push(L.marker(p, { icon }).addTo(decorLayer));
          }
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
    if (spinner) spinner.classList.add('hidden');
  });

  // Play/Pause/Replay toggle
  playToggle?.addEventListener('click', () => {
    if (!segmentPoints.length || totalLen <= 0) return;
    if (!playing && progress >= totalLen) {
      // replay from start
      progress = 0;
      if (busMarker) busMarker.setLatLng(segmentPoints[0]);
    }
    if (playing) {
      stopAnimation();
    } else {
      startAnimation();
    }
  });

  // Expose a tiny API for picking stops via marker clicks
  return {
    setPoint,
  } as const;
}
