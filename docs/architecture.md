# Architecture

## Overview

Campus Navigation is a mobile-first app that routes students between
named campus locations using OpenStreetMap data. It has three parts:

1. A Python routing engine (Phase 1–2)
2. A FastAPI backend that wraps the engine (Phase 3–12, 15–17)
3. A React Native mobile app and a Next.js admin site (Phase 5–11, 14)

## Folder structure

    campus-nav/
    ├── backend/
    │   ├── core/          # routing engine + narration (frozen + wrappers)
    │   ├── pipeline/      # map.osm → SQLite
    │   ├── api/           # FastAPI app
    │   │   ├── routers/   # public HTTP endpoints
    │   │   │   └── admin/ # admin-only endpoints, JWT-guarded
    │   │   ├── services/  # business logic
    │   │   ├── schemas/   # Pydantic request/response shapes
    │   │   ├── models/    # SQLAlchemy ORM models
    │   │   └── db/        # session and migrations
    │   ├── tests/         # pipeline, API, and performance tests
    │   └── data/          # map.osm, campus.db, media uploads
    ├── mobile/            # Expo + React Native
    │   ├── app/           # Expo Router screens
    │   ├── components/    # reusable UI
    │   ├── services/      # API client, GPS, compass, TTS, storage, haptics
    │   ├── hooks/         # custom React hooks
    │   ├── utils/         # pure helpers (geometry, formatting, progress)
    │   ├── constants/     # config, categories, icons, theme
    │   ├── context/       # settings
    │   └── i18n/          # en.json, sw.json
    ├── admin/
    │   ├── scripts/       # CLI tools
    │   └── site/          # Next.js admin website
    ├── deploy/
    │   └── nginx/         # reverse proxy config
    └── docs/

## The routing core

Three files in `backend/core/` do the actual work:

- **`campus_graph.py`** — parses `map.osm`, builds the routable graph,
  runs A*, generates turn-by-turn instructions, provides geometry helpers.
- **`ai_navigator.py`** — walks the route, builds a chronological
  timeline of areas and junctions, narrates it.
- **`turn_by_turn.py`** — CLI debug tool.

**These three files are frozen.** Every phase builds on top of them.

## The narration wrapper

- **`narration.py`** — the entry point. Applies a mention budget,
  calls the model (or the local narrator), validates the response,
  retries once on failure, falls back to deterministic narration.
- **`validator.py`** — checks the model's output against the timeline.

## The data pipeline

- **`ingest.py`** — parses `map.osm` once and writes `places`, `areas`,
  and `path_edges`.
- **`validate_map.py`** — sanity-checks `map.osm` before ingest.
- **`reimport.py`** — merge-safe re-import.

## The API

FastAPI. Public endpoints and admin endpoints (JWT-guarded) under
`/api/admin`. Key endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Full dependency health |
| GET | `/api/places` | List/search places |
| GET | `/api/route` | Compute a walking route |
| GET | `/api/narrate` | Produce narration |
| POST | `/api/chat` | In-walk questions |
| POST | `/api/chat/extract-destination` | Sentence → place ID |
| GET | `/api/wifi/nearby` | Wi-Fi spots near a position |
| POST | `/api/admin/auth/login` | Admin login |
| GET | `/api/admin/stats` | Dashboard counts |
| PATCH | `/api/admin/places/{id}` | Edit a place |

## The mobile app

Expo + React Native, plain JavaScript. Screens use Expo Router.

- **Onboarding** — first-launch three-slide introduction.
- **Home** — search, category chips, recents and favorites.
- **Explore** — browse the whole campus by category.
- **Place detail** — photos, description, hours, accessibility.
- **Route preview** — map with the route drawn, turn-by-turn, narration.
- **Walking mode** — live GPS, snap-to-path, instruction card, compass
  arrow, spoken instructions, haptics, off-route detection, Wi-Fi
  proximity, approach photo, report button, chat.
- **Arrival** — destination photo, feedback, save.
- **Chat** — general and route-aware.
- **Settings** — language, voice, accessibility, Wi-Fi, units.

**Accessibility:** large-text mode, reduced motion, haptic feedback,
screen-reader labels, minimum 48-point touch targets, WCAG AA
contrast.

Maps use `@maplibre/maplibre-react-native` with OpenFreeMap tiles.
Requires a development build rather than Expo Go.

## The admin site

Next.js 14, plain JavaScript. Runs on port 3000 in development.
JWT-authenticated. Talks to the backend through a server-side proxy
that keeps the session token off the browser.

Screens: Dashboard, Map Health, Reports, Photos, Places, Route
Tester, Re-import, Roles, Login.

## Deployment

The production stack:

    nginx  →  api (FastAPI)  →  postgres (with PostGIS)
              admin (Next.js)      redis

Docker Compose defines the whole stack. `docs/deployment.md` covers
setup, TLS, backups, and updates.

The deploy workflow builds and pushes Docker images on every push to
`main`, but the actual deploy step is commented out until a target
server exists.

## Data and storage

- **Database:** SQLite by default. Postgres + PostGIS is prepared
  but deferred (Phase 13's code is written, only the server is
  missing). Setting `DATABASE_URL` switches the app over.
- **Cache:** Redis (optional). Without it, the app falls through to
  live computation.
- **Media:** uploaded photos live under `backend/data/media/`.

## Testing

Around 200 backend tests. Around 90 mobile tests. Every phase's
feature has tests.

The backend uses pytest. The mobile app uses Jest.

## What's not done

- **Kiswahili narration.** The UI is bilingual, but the narration
  text is still English. Needs the Groq path with a Kiswahili
  prompt, or a Kiswahili local narrator.
- **Compass arrow on some devices.** Works on most phones, not all.
  Needs device-specific testing.
- **Postgres in production.** The code is ready, the server isn't.
- **Indoor navigation, AR, timetable, multi-campus.** Phase 19's
  speculative future scope.

## What gets added, phase by phase

| Phase | Adds |
|---|---|
| 1 | Repo skeleton, tests, CI |
| 2 | Narration validator, mention budget |
| 3 | SQLite database, ingestion pipeline, re-import |
| 4 | FastAPI backend |
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
| 17 | Hardening, observability, deployment |
| 18 | Accessibility, Explore, onboarding, pilot |

See `docs/roadmap.md` for the full plan.