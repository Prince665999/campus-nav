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
later phase builds on top of them rather than editing them. The
`backend/core/__init__.py` shim puts `backend/core/` on `sys.path` so
these files' top-level imports (`import campus_graph`) resolve when
loaded from the API.

## The narration wrapper

Two files sit alongside the frozen core and add behaviour without
changing it:

- **`narration.py`** — the entry point for the rest of the app. It
  applies a mention budget (roughly one area per 40 m of walking), calls
  the model, validates the response, retries once on failure, and falls
  back to the deterministic local narration.

- **`validator.py`** — checks that the model's output stays grounded in
  the timeline. Three checks: no invented place names, no invented
  distances, and first-mention order matches timeline order.

## The data pipeline

Three files in `backend/pipeline/`:

- **`ingest.py`** — parses `map.osm` once and writes `places`, `areas`,
  and `path_edges` tables. Run via `make ingest`.

- **`validate_map.py`** — sanity-checks `map.osm` before ingest:
  dangling refs, duplicate IDs, short ways, named nodes with no path
  connection.

- **`reimport.py`** — merge-safe re-import. Matches on `osm_id` and
  writes only OSM-sourced columns, so manual edits (photos, descriptions
  added later) survive a map refresh.

## The API

`backend/api/` is a FastAPI application. Every endpoint is a thin
wrapper around a service:

- **Routers** (`routers/`) — HTTP handling, query params, error raising
- **Services** (`services/`) — the actual logic, one file per domain
- **Schemas** (`schemas/`) — Pydantic shapes for request/response
- **Models** (`models/`) — SQLAlchemy ORM tables

Endpoints shipped in Phase 4:

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

The graph is loaded once at startup by `graph_service.py` and shared
across requests. Routes are computed by `routing_service.py`, which
applies the selected profile by rebuilding the graph with cost-adjusted
weights before calling the frozen `a_star`.

## Routing profiles

Five profiles in `backend/core/routing_profiles.py` adjust edge weights
without touching `a_star`:

- `fastest` — no adjustment
- `step-free` — 999× on steps and wheelchair=no (effectively blocked)
- `well-lit` — 1.6× penalty on unlit paths
- `covered` — 0.85× bonus on covered paths
- `scenic` — small bonuses on scenic/described paths

## What gets added, phase by phase

| Phase | Adds |
|---|---|
| 1 | Repo skeleton, tests around the core, CI |
| 2 | Output validator, mention budget, narration wrapper |
| 3 | SQLite database, ingestion pipeline, merge-safe re-import |
| 4 | FastAPI backend: places, areas, route, narrate, health |
| 5 | Mobile app: search, map, route preview |
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