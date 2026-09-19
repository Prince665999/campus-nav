# Architecture

## Overview

Campus Navigation is a mobile-first app that routes students between
named campus locations using OpenStreetMap data. It has three parts:

1. A Python routing engine (Phase 1–2)
2. A FastAPI backend that wraps the engine (Phase 3–4)
3. A React Native mobile app and Next.js admin site (Phase 5, Phase 14)

## Folder structure

    campus-nav/
    ├── backend/
    │   ├── core/          # routing engine + narration (frozen + wrappers)
    │   ├── pipeline/      # map.osm → SQLite (Phase 3)
    │   ├── api/           # FastAPI app (Phase 4)
    │   │   ├── routers/   # HTTP endpoints
    │   │   ├── services/  # business logic, one per domain
    │   │   ├── schemas/   # Pydantic request/response shapes
    │   │   ├── models/    # SQLAlchemy ORM models
    │   │   └── db/        # session and migrations
    │   ├── tests/         # pipeline and API tests
    │   └── data/          # map.osm, campus.db, snapshots
    ├── mobile/            # Expo + React Native (Phase 5)
    │   ├── app/           # Expo Router screens
    │   ├── components/    # reusable UI pieces
    │   ├── services/      # API client, later GPS/compass/voice
    │   ├── hooks/         # custom React hooks
    │   ├── utils/         # pure helper functions
    │   ├── constants/     # config values, categories
    │   ├── i18n/          # translation strings
    │   └── __tests__/     # Jest unit tests
    ├── admin/             # CLI scripts + Next.js site (Phase 11, 14)
    └── docs/              # this file, roadmap, tagging guide

## The routing core

Three files in `backend/core/` do the actual work:

- **`campus_graph.py`** — parses `map.osm`, builds the routable graph,
  runs A*, generates turn-by-turn instructions, and provides all the
  geometry helpers (haversine, bearing, point-in-polygon, densify).

- **`ai_navigator.py`** — walks the route, finds named areas and
  junctions alongside it, builds a chronological timeline of everything
  that happens, and either asks an LLM to narrate the walk or falls
  back to a local narration builder.

- **`turn_by_turn.py`** — a CLI debug tool. Prints the route, the
  turn-by-turn steps, and the exact timeline the narrator receives.

**These three files are frozen.** They work, they're tested, and every
later phase builds on top of them rather than editing them.

## The narration wrapper

Two files sit alongside the frozen core:

- **`narration.py`** — the entry point for the rest of the app. Applies
  a mention budget, calls the model, validates the response, retries
  once on failure, falls back to deterministic local narration.

- **`validator.py`** — checks that the model's output stays grounded in
  the timeline. Three checks: no invented place names, no invented
  distances, first-mention order matches timeline order.

## The data pipeline

Three files in `backend/pipeline/`:

- **`ingest.py`** — parses `map.osm` once and writes `places`, `areas`,
  and `path_edges` tables.
- **`validate_map.py`** — sanity-checks `map.osm` before ingest.
- **`reimport.py`** — merge-safe re-import. Matches on `osm_id` and
  writes only OSM-sourced columns.

## The API

`backend/api/` is a FastAPI application. Every endpoint is a thin
wrapper around a service:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Graph version, counts, uptime |
| GET | `/api/places` | List/search places |
| GET | `/api/places/search` | Search by name substring |
| GET | `/api/places/{id}` | Full detail for one place |
| GET | `/api/areas` | List named polygons |
| GET | `/api/areas/{id}` | Full detail for one area |
| GET | `/api/route` | Compute a walking route |
| GET | `/api/narrate` | Produce narration for a route |

Routes are computed by `routing_service.py` using the frozen `a_star`
with shortest-distance edge weights. The graph is loaded once at
startup by `graph_service.py` and shared across requests.

## The mobile app

`mobile/` is an Expo + React Native app, in plain JavaScript.

**Screens** (`app/`) use Expo Router for file-based navigation:

- `index.jsx` — Home: search bar, category chips, results list
- `place/[id].jsx` — Place detail: description, hours, accessibility
- `route-preview.jsx` — Route on a map + turn-by-turn + narration

**Key components** (`components/`):

- `MapView.jsx` — MapLibre + OpenFreeMap map rendering
- `SearchBar.jsx`, `CategoryChips.jsx`, `PlaceCard.jsx`
- `RouteSummary.jsx` — distance, time, from/to

**Services** (`services/`):

- `api.js` — every HTTP call the app makes

**Supporting folders:**

- `utils/` — pure functions (formatting, later geometry)
- `hooks/` — `useDebounce` and, in Phase 6, `useWalkingProgress`
- `constants/` — configuration, category list
- `i18n/` — translation strings (English now, Kiswahili in Phase 9)

**Map rendering:** The app uses `@maplibre/maplibre-react-native` with
OpenFreeMap's Liberty style. Both are free — no API key, no account,
no billing. This means the app requires a development build (EAS Build
or `npx expo run:android`), not Expo Go. JavaScript changes hot-reload
through Metro; native config changes require a new build.

**Testing:** Jest with `jest-expo`. Tests cover pure logic (formatting,
API URL construction) — not rendering. Rendering tests would require
mocking Metro, MapLibre, Expo Router, and AsyncStorage, which is more
configuration than value at this stage.

**CI:** `.github/workflows/mobile-ci.yml` runs ESLint and Jest on
every push that touches `mobile/`.

## What gets added, phase by phase

| Phase | Adds |
|---|---|
| 1 | Repo skeleton, tests around the core, CI |
| 2 | Output validator, mention budget, narration wrapper |
| 3 | SQLite database, ingestion pipeline, merge-safe re-import |
| 4 | FastAPI backend: places, areas, route, narrate, health |
| 5 | Mobile app: search, place detail, map, route preview |
| 6 | Live GPS, snap-to-path, walking mode |
| 7 | Compass, voice |
| 8 | Photos, approach photo |
| 9 | Bilingual support |
| 10 | Favorites, recents, reports, arrival |
| 11 | Admin CLI scripts |
| 12 | Redis caching |
| 13 | PostgreSQL + PostGIS |
| 14 | Full admin website |
| 15 | AI chat |
| 16 | Wi-Fi proximity |
| 17 | Hardening, observability |
| 18 | Accessibility, pilot |
| 19 | Beyond (indoor nav, AR, multi-campus) |

See `docs/roadmap.md` for the full plan.