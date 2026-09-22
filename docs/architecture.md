# Architecture

## Overview

Campus Navigation is a mobile-first app that routes students between
named campus locations using OpenStreetMap data. It has three parts:

1. A Python routing engine (Phase 1–2)
2. A FastAPI backend that wraps the engine (Phase 3–4, extended through 12)
3. A React Native mobile app and a Next.js admin site (Phase 5, Phase 14)

## Folder structure

    campus-nav/
    ├── backend/
    │   ├── core/          # routing engine + narration (frozen + wrappers)
    │   ├── pipeline/      # map.osm → SQLite
    │   ├── api/           # FastAPI app
    │   │   ├── routers/   # public HTTP endpoints
    │   │   │   └── admin/ # admin-only endpoints, guarded
    │   │   ├── services/  # business logic, one per domain
    │   │   ├── schemas/   # Pydantic request/response shapes
    │   │   ├── models/    # SQLAlchemy ORM models
    │   │   └── db/        # session and (later) migrations
    │   ├── tests/         # pipeline and API tests
    │   └── data/          # map.osm, campus.db, media uploads
    ├── mobile/            # Expo + React Native
    │   ├── app/           # Expo Router screens
    │   ├── components/    # reusable UI
    │   ├── services/      # API client, GPS, compass, TTS, storage
    │   ├── hooks/         # custom React hooks
    │   ├── utils/         # pure helpers (geometry, formatting, progress)
    │   ├── constants/     # config, categories, theme
    │   └── i18n/          # en.json, sw.json
    ├── admin/
    │   ├── scripts/       # CLI tools (Phase 11)
    │   └── site/          # Next.js admin website
    │       ├── app/       # App Router pages and the proxy route
    │       ├── components/# shared UI
    │       └── lib/       # API client, auth helpers, formatting
    └── docs/

## The routing core

Three files in `backend/core/` do the actual work:

- **`campus_graph.py`** — parses `map.osm`, builds the routable graph,
  runs A*, generates turn-by-turn instructions, provides geometry helpers.
- **`ai_navigator.py`** — walks the route, builds a chronological
  timeline of areas and junctions, narrates it.
- **`turn_by_turn.py`** — CLI debug tool. Prints route, steps, timeline.

**These three files are frozen.** Every phase builds on top of them.

## The narration wrapper

Two files in `backend/core/` add behaviour without changing the core:

- **`narration.py`** — the entry point. Applies a mention budget, calls
  the model (or the local narrator), validates the response, retries
  once on failure, falls back to deterministic narration.
- **`validator.py`** — checks the model's output against the timeline.
  No invented names, no invented distances, correct order.

## The data pipeline

Three files in `backend/pipeline/`:

- **`ingest.py`** — parses `map.osm` once and writes `places`, `areas`,
  and `path_edges`.
- **`validate_map.py`** — sanity-checks `map.osm` before ingest.
- **`reimport.py`** — merge-safe re-import. Matches on `osm_id` and
  writes only OSM-sourced columns.

## The API

`backend/api/` is a FastAPI application.

Public endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Graph version, counts, uptime |
| GET | `/api/places` | List/search places |
| GET | `/api/places/search` | Search by name |
| GET | `/api/places/{id}` | Full detail for one place |
| GET | `/api/areas` | List named polygons |
| GET | `/api/areas/{id}` | Full detail for one area |
| GET | `/api/route` | Compute a walking route |
| GET | `/api/narrate` | Produce narration |
| GET | `/api/media/place/{id}` | Photos for a place |
| POST | `/api/media` | Upload a photo (used by CLI) |
| GET/POST | `/api/destinations/recent` | Recent destinations |
| GET/POST/DELETE | `/api/destinations/favorites` | Favorites |
| POST | `/api/reports` | Submit a report |

Admin endpoints (all under `/api/admin`, guarded by `X-Admin-Key`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/stats` | Dashboard counts |
| PATCH | `/api/admin/places/{id}` | Update place fields |
| DELETE | `/api/admin/places/{id}` | Delete a place |
| POST | `/api/admin/media` | Upload a photo |
| DELETE | `/api/admin/media/{id}` | Delete a photo |
| GET | `/api/admin/reports` | List reports |
| PATCH | `/api/admin/reports/{id}` | Change report status |
| GET | `/api/admin/map-health` | Run map health checks |
| GET | `/api/admin/reimport/diff` | Show what a re-import would change |
| POST | `/api/admin/reimport` | Run the re-import |
| GET/POST/DELETE | `/api/admin/users` | Manage admin accounts |

## The mobile app

Expo + React Native, plain JavaScript. Screens use Expo Router.

- **Home** — search, category chips, recents and favorites.
- **Place detail** — photos, description, hours, accessibility, favorite
  toggle, report link.
- **Route preview** — map with the route drawn, turn-by-turn steps,
  narration, "Start walking".
- **Walking mode** — live GPS with snap-to-path, auto-advancing
  instruction card, compass arrow, spoken instructions, off-route
  banner, approach photo, report button.
- **Arrival** — destination photo, helpful/not-helpful feedback, save.
- **Settings** — language toggle, voice, units, Wi-Fi notifications.

Maps use `@maplibre/maplibre-react-native` with OpenFreeMap tiles —
free, no API key. This requires a development build rather than Expo Go.

**Offline:** not supported. The app requires network access to the API.

## The admin site

Next.js 14, plain JavaScript. Runs on `http://localhost:3000`.

- **Dashboard** — counts and recent activity.
- **Map Health** — the checks from Phase 11 in detail.
- **Reports** — triage queue with filter and detail drawer.
- **Photos** — pick a place, upload photos, delete existing ones.
- **Places** — edit database-managed fields; OSM fields come from re-import.
- **Route Tester** — the browser version of `turn_by_turn.py`.
- **Re-import** — diff view and one-click re-import.
- **Roles** — manage admin accounts.

**The admin site never talks to the backend directly.** Every request
goes through `/api/proxy/*`, a Next.js route handler that adds the
`X-Admin-Key` header server-side. The browser never sees the key.
This is the interim guard until Phase 17 replaces it with JWT login.

## Data and storage

- **Database:** SQLite (`backend/data/campus.db`). Postgres + PostGIS is
  planned for Phase 13, deferred until the environment supports it. The
  code is written to work on both — setting `DATABASE_URL` to a Postgres
  URL switches the app over with no other changes.
- **Cache:** Redis (optional). Routes and narrations are cached. If
  Redis isn't running, the app falls through to live computation.
- **Media:** uploaded photos live under `backend/data/media/`, served
  as static files by the API at `/media/*`.

## What gets added, phase by phase

| Phase | Adds |
|---|---|
| 1 | Repo skeleton, tests, CI |
| 2 | Narration validator, mention budget |
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
| 13 | PostgreSQL + PostGIS (deferred) |
| 14 | Full admin website |
| 15 | AI chat |
| 16 | Wi-Fi proximity |
| 17 | Hardening, observability |
| 18 | Accessibility, pilot |
| 19 | Beyond (indoor nav, AR, multi-campus) |

See `docs/roadmap.md` for the full plan.