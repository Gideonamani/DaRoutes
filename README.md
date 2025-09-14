# Dar Bus Map (DaRoutes) — Cleanup Plan and Launch Roadmap

This repo currently contains quick prototypes for visualizing Dar bus routes with Leaflet, a KML polyline, and a CSV of stops. This document proposes a cleanup, a minimal structure to support progressive improvements, and a realistic timeline to MVP launch.

## Current State (Findings)

- Static HTML prototypes using Leaflet and CDN scripts.
  - `index.html` loads OpenStreetMap tiles, a KML for routes, and a CSV for stops via PapaParse.
  - Multiple variants `animate1.html` … `animate12.html` explore animation and UI ideas.
- Data files at project root:
  - `Bus Route Paths.kml` (route polyline(s))
  - `Kawe-Gerezani.csv` (stops with lat/lon + name)
- Gaps and risks:
  - Prototype duplication; no shared JS/CSS, no modules.
  - Data formats mixed (KML + CSV); no normalized schema or versioning.
  - Some code pages have encoding artifacts (e.g., haversine math symbols in `animate12.html`).
  - No build tooling, tests, or deployment setup.

## Goals

- Single, clean web app that:
  - Renders routes and stops reliably from normalized data (GeoJSON).
  - Lets users search From/To, snap to nearest stop, and preview the path along the route.
  - Shows a basic fare estimate and travel distance/time.
  - Is easy to iterate on (modular code, lint/format, simple build).

## Proposed Cleanup & Structure

1) Normalize repo structure

```
DaRoutes/
├─ public/                  # Static assets served as-is
│  ├─ index.html            # Minimal shell, loads /src/main.ts
│  ├─ icons/                # Marker and app icons
│  └─ tiles.txt             # Notes + attributions if needed
├─ data/                    # Versioned, normalized datasets
│  ├─ routes.geo.json       # GeoJSON LineString/MultiLineString features
│  ├─ stops.geo.json        # GeoJSON Point features with StopName, id
│  └─ metadata.json         # Route names, fare tables, etc
├─ scripts/                 # Data conversion and checks (node/ts)
│  └─ convert-kml-csv.ts    # KML->GeoJSON, CSV->GeoJSON
├─ src/
│  ├─ main.ts               # App entry
│  ├─ map/initMap.ts        # Leaflet init, base layers, controls
│  ├─ data/load.ts          # Fetch + parse data, type guards
│  ├─ ui/controls.ts        # From/To inputs, play/pause, speed
│  ├─ logic/snap.ts         # Closest-stop search, distance utils
│  ├─ logic/animate.ts      # Polyline animation engine
│  └─ styles.css
├─ README.md
├─ package.json             # Vite + TypeScript + ESLint + Prettier
└─ tsconfig.json
```

2) Consolidate prototypes
- Fold the best parts of `animate*.html` into a single app with controls:
  - Play/Pause/Speed for route animation.
  - From/To fields that snap to nearest stops and draw access/egress legs.
  - Clean marker icons, consistent styling.

3) Normalize data
- Convert `Bus Route Paths.kml` to `routes.geo.json` with a shared schema.
- Convert `Kawe-Gerezani.csv` to `stops.geo.json` with `{ id, name, lat, lon }` and GeoJSON `Point` geometry.
- Add a simple `metadata.json` for route codes, segments, and static fare rules.

4) Adopt minimal tooling
- Dev/build: Vite + TypeScript (fast, simple bundling).
- Quality: ESLint (typescript-eslint), Prettier, EditorConfig.
- Tests: Vitest for utility functions (distance, snapping); add e2e later.
- Deploy: GitHub Pages or Netlify (static hosting), with a `vite` build.

5) Performance & UX basics
- Keep Leaflet + raster tiles for MVP; consider MapLibre GL later if needed.
- Debounce search, avoid re-render churn, lazy-load data.
- Respect tile provider attribution and rate limits; cache-bust data updates.

## Data Model (MVP)

- `stops.geo.json` (FeatureCollection<Point>): `{ id, name, tags?, ... }`
- `routes.geo.json` (FeatureCollection<LineString|MultiLineString>): `{ id, route, direction?, segmentId? }`
- `metadata.json`: `{ routes: [{ id, name, fareRules: {...} }], version, generatedAt }`

This enables:
- Nearest-stop snapping via haversine or turf.js equivalent.
- Drawing route subsections between two stops.
- Static fare estimate by distance or stop count bands.

## Immediate Next Steps (Day 0–1)

- Create Vite + TS skeleton (no network data changes required yet).
- Move current `index.html` concepts into `src/` modules.
- Add `scripts/convert-kml-csv.ts` with TODOs and sample output schemas.
- Manually export first pass of `stops.geo.json` and `routes.geo.json` for MVP.
- Replace direct KML/CSV loading in the app with GeoJSON loaders.

## Feature Roadmap (Progressive Enhancements)

- Search & Snap: From/To inputs, nearest stop snapping, visual access legs.
- Route Pathing: Select the polyline segment between snapped stops.
- Fare Estimate: Static rules per km or per segment; show breakdown.
- Animation: Play the bus along the chosen segment with controls.
- UI Polish: Sidebar with route info, stop list, shareable URL params.
- Offline & PWA: Basic offline shell and data caching for stops/routes.
- Analytics & Feedback: Track usage, add a feedback link.
- Internationalization: Copy in English + Swahili.
- Live Data (stretch): Integrate GPS or GTFS-RT if/when available.

## Launch Timeline (Assumptions + Plan)

Assumptions:
- Scope = MVP: static routes/stops, search From/To, path preview, basic fare, simple animation. No live bus positions.
- One engineer, part-time to full-time equivalent. Adjust as needed.

Week 1 — Foundation
- Tooling: Vite + TS, ESLint, Prettier, EditorConfig, basic Vitest.
- App shell: map init, base layer, modular structure.
- Data: convert current KML/CSV to first `routes.geo.json` and `stops.geo.json`.
- Deploy: set up preview deploy (Netlify or GH Pages).

Week 2 — Core UX
- Implement From/To snapping + access/egress polylines.
- Draw route subsection between snapped stops.
- Fare estimate (static banding); unit tests for distance/snap.
- Minimal UI: inputs, route info panel, attribution & disclaimers.

Week 3 — Animation & Polish
- Bus animation along selected segment (controls: play/pause/speed).
- Error handling, empty states, loading indicators.
- Performance pass (debounce, minimal reflows, data caching).
- A11y basics, responsive layout, i18n scaffolding.

Week 4 — MVP Launch
- Content & branding pass (name, icons, meta tags).
- QA checklist, manual test matrix, cross-device sanity.
- Finalize hosting config, add versioning to data files.
- Launch public URL; add feedback form + analytics.

Post-Launch (Weeks 5–6)
- PWA offline shell and cache strategy.
- Refine fare model and add route disambiguation.
- Optional stretch: investigate MapLibre GL and vector tiles for perf.

## Risks & Mitigations

- Data Quality: KML/CSV inconsistencies —> Normalize to GeoJSON with validation script, document assumptions.
- Tile Limits: OSM tile rate limits —> Consider MapTiler/Mapbox key with env configuration and attribution.
- Encoding Issues: Non-ASCII math symbols in prototypes —> Centralize utils with tested haversine, remove duplicates.
- Scope Creep: Guard MVP; backlog stretch features.

## Notes for Migration

- Keep current prototypes for reference; do not delete until parity is reached.
- Start by wiring the app to GeoJSON so data can evolve without code rewrites.
- Use semantic versioning for `data/` and include a `metadata.json` with `version`.

---

If you’d like, I can scaffold the Vite + TypeScript structure and migrate the current `index.html` logic into modules, plus generate initial `stops.geo.json` and `routes.geo.json` from the existing files.

