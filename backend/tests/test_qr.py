"""
Tests for QR start points.

A node tagged qr=<code> in final.osm becomes an indoor place with category
"qr". It must (a) be found by /api/qr/<code>, (b) be usable as a route start,
and (c) never show up in searches or room counts.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.api.dependencies import db_session
from backend.api.errors import http_exception_handler
from backend.api.models.place import Place
from backend.api.routers import qr as qr_router
from backend.api.services import place_service
from backend.pipeline.ingest import ingest_indoor_places


def _node(lat, lon, **tags):
    return {"lat": lat, "lon": lon, "tags": tags}


def _osm(extra=None):
    nodes = {
        "-1": _node(-8.94, 33.41, name="Room 1 door", door="yes",
                    level="0", building_name="Library"),
        "-2": _node(-8.9401, 33.4101, name="the corridor near Room 1",
                    qr="LIB-G-01", level="0", building_name="Library"),
        "-3": _node(-8.9402, 33.4102, name="the corridor by the stairs",
                    qr="LIB-G-02", level="1", building_name="Library"),
    }
    nodes.update(extra or {})
    return nodes, []


@pytest.fixture
def session(temp_db):
    from backend.api.db.session import session_scope
    with session_scope() as s:
        yield s


def test_ingest_creates_qr_places(session):
    nodes, ways = _osm()
    counts = ingest_indoor_places(nodes, ways, session)
    session.flush()

    assert counts["qr_points"] == 2
    row = session.query(Place).filter_by(ref="LIB-G-01").one()
    assert row.kind == "indoor"          # so routing treats it as an indoor start
    assert row.category == "qr"
    assert row.name == "the corridor near Room 1"
    assert row.building_name == "Library"
    assert row.level == "0"
    assert session.query(Place).filter_by(ref="LIB-G-02").one().level == "1"


def test_ingest_skips_bad_duplicate_and_door_qr_tags(session, capsys):
    nodes, ways = _osm(
        {
            "-4": _node(0, 0, name="bad", qr="has space"),
            "-5": _node(0, 0, name="dupe", qr="lib-g-01"),   # same as -2, any case
            "-6": _node(0, 0, name="a door", door="yes", qr="DOOR-1"),
            "-7": _node(0, 0, qr="NONAME-1"),            # no name tag
        }
    )
    counts = ingest_indoor_places(nodes, ways, session)
    session.flush()

    assert counts["qr_points"] == 3            # LIB-G-01, LIB-G-02, NONAME-1
    out = capsys.readouterr().out
    assert "invalid qr code" in out
    assert "must be unique" in out
    assert "also a door" in out
    noname = session.query(Place).filter_by(ref="NONAME-1").one()
    assert noname.name == "corridor point NONAME-1"


def test_qr_points_are_hidden_from_search_and_counts(session):
    nodes, ways = _osm()
    ingest_indoor_places(nodes, ways, session)
    session.flush()

    names = [p.name for p in place_service.search_places(session)]
    assert "Room 1 door" in names
    assert "the corridor near Room 1" not in names
    assert place_service.search_places(session, q="corridor") == []
    assert place_service.search_places(session, kind="indoor", building_name="Library")[0].name == "Room 1 door"

    # Only the door counts as a room, not the two QR points.
    assert place_service.list_building_counts(session) == {"Library": 1}

    # Asking for them explicitly still works (admin/debug).
    qr_only = place_service.search_places(session, category="qr")
    assert {p.name for p in qr_only} == {
        "the corridor near Room 1", "the corridor by the stairs"
    }


@pytest.fixture
def client(session):
    app = FastAPI()
    app.include_router(qr_router.router)
    app.add_exception_handler(Exception, http_exception_handler)
    from fastapi import HTTPException
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.dependency_overrides[db_session] = lambda: session
    nodes, ways = _osm()
    ingest_indoor_places(nodes, ways, session)
    session.flush()
    return TestClient(app, raise_server_exceptions=False)


def test_resolve_known_code(client):
    r = client.get("/api/qr/LIB-G-01")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "the corridor near Room 1"
    assert body["kind"] == "indoor"
    assert body["building_name"] == "Library"
    assert body["level"] == "0"
    assert body["location"] == {"lat": -8.9401, "lon": 33.4101}


def test_resolve_is_case_insensitive(client):
    assert client.get("/api/qr/lib-g-02").status_code == 200


def test_unknown_and_malformed_codes_are_404(client):
    assert client.get("/api/qr/NOPE-1").status_code == 404
    assert client.get("/api/qr/%20%20").status_code == 404
    assert client.get("/api/qr/" + "A" * 40).status_code == 404


def test_an_ordinary_door_is_not_a_qr_code(client):
    # "Room 1 door" has no qr tag, and its ref is empty.
    assert client.get("/api/qr/Room1door").status_code == 404
