# Campus Navigation

A mobile-first campus navigation app built around an existing A* routing engine.
Students search a destination, see a walking route, and get landmark-based
turn-by-turn directions narrated in English or Kiswahili.

## Status

Phase 1 — routing core packaged, tested, and CI-wired.
No API, no mobile app, no database yet.

## What's here

- `backend/core/` — the routing engine (frozen, do not edit casually)
  - `campus_graph.py` — OSM parsing, graph building, A*, geometry, turns
  - `ai_navigator.py` — landmark detection, timeline building, narration
  - `turn_by_turn.py` — CLI debug tool + accuracy check
- `backend/core/tests/` — pytest suite
- `backend/data/map.osm` — the campus map (drop your real one here)
- `docs/` — architecture and roadmap

## Running the CLI

    cd backend/core
    python turn_by_turn.py ../../data/map.osm

## Running the tests

    make test

or:

    cd backend
    pytest

## Roadmap

See `docs/roadmap.md` for the full 19-phase build plan.