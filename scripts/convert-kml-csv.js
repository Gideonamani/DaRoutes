// Simple one-off converter: KML LineString + CSV stops -> GeoJSON
// Inputs:  Bus Route Paths.kml, Kawe-Gerezani.csv (project root)
// Outputs: public/data/routes.geo.json, public/data/stops.geo.json

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const inputKml = path.join(root, 'Bus Route Paths.kml');
const inputCsv = path.join(root, 'Kawe-Gerezani.csv');
const outDir = path.join(root, 'public', 'data');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function parseKmlToGeoJSON(kmlText) {
  // Extract all <coordinates>...</coordinates>
  const coordsRegex = /<coordinates>([\s\S]*?)<\/coordinates>/g;
  const lines = [];
  let match;
  while ((match = coordsRegex.exec(kmlText))) {
    const raw = match[1]
      .replace(/\r/g, ' ')
      .replace(/\n/g, ' ')
      .trim();
    const pairs = raw.split(/\s+/).filter(Boolean);
    const coords = pairs.map((p) => {
      const parts = p.split(',').map((n) => Number(n.trim()));
      // KML order: lon,lat[,alt]
      const [lon, lat] = parts;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return [lon, lat];
    }).filter(Boolean);
    if (coords.length > 1) lines.push(coords);
  }

  let feature;
  if (lines.length === 1) {
    feature = {
      type: 'Feature',
      properties: { id: 'route-1', name: 'Kawe-Gerezani' },
      geometry: { type: 'LineString', coordinates: lines[0] },
    };
  } else {
    feature = {
      type: 'Feature',
      properties: { id: 'route-1', name: 'Kawe-Gerezani' },
      geometry: { type: 'MultiLineString', coordinates: lines },
    };
  }

  return { type: 'FeatureCollection', features: [feature] };
}

function parseCsvToGeoJSON(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { type: 'FeatureCollection', features: [] };
  const header = lines[0].split(',');
  const col = (name) => header.indexOf(name);
  const latIdx = col('lat');
  const lonIdx = col('lon');
  const nameIdx = col('StopName');

  const features = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    if (row.length < 4) continue;
    const lat = Number(row[latIdx]);
    const lon = Number(row[lonIdx]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const name = row[nameIdx] && row[nameIdx].length ? row[nameIdx] : `Stop ${i}`;
    features.push({
      type: 'Feature',
      properties: { id: `stop-${i}`, name },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    });
  }
  return { type: 'FeatureCollection', features };
}

function main() {
  ensureDir(outDir);

  // KML -> routes.geo.json
  const kmlText = fs.readFileSync(inputKml, 'utf8');
  const routes = parseKmlToGeoJSON(kmlText);
  fs.writeFileSync(path.join(outDir, 'routes.geo.json'), JSON.stringify(routes, null, 2));

  // CSV -> stops.geo.json
  const csvText = fs.readFileSync(inputCsv, 'utf8');
  const stops = parseCsvToGeoJSON(csvText);
  fs.writeFileSync(path.join(outDir, 'stops.geo.json'), JSON.stringify(stops, null, 2));

  console.log(`Wrote ${routes.features.length} route feature(s) and ${stops.features.length} stop(s).`);
}

main();

