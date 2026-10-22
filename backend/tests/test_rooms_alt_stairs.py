"""
Tests for: rooms added later still being listed, alternative names, and
stairs polygons.
"""

import pytest

from backend.api.models.indoor_area import IndoorArea
from backend.api.models.place import Place
from backend.api.schemas.place import PlaceListParams
from backend.api.services import place_service
from backend.pipeline.ingest import ingest_indoor_places


@pytest.fixture
def session(temp_db):
    from backend.api.db.session import session_scope
    with session_scope() as s:
        yield s


def _add_rooms(session, count, building="Library"):
    for i in range(count):
        session.add(
            Place(
                osm_type="node", osm_id=f"-{1000 + i}", kind="indoor",
                name=f"Room {i:03d}", lat=-8.94, lon=33.41,
                building_name=building, level="0",
            )
        )
    session.flush()


def test_limit_cap_is_raised_to_2000():
    assert PlaceListParams(limit=2000).limit == 2000
    with pytest.raises(Exception):
        PlaceListParams(limit=2001)


def test_a_long_list_keeps_the_newest_rooms_too(session):
    # 300 rooms. Under the old code (no ORDER BY) LIMIT 200 kept only the
    # first 200 stored and the newest 100 never appeared.
    _add_rooms(session, 300)
    got = place_service.search_places(session, kind="indoor", limit=2000)
    assert len(got) == 300
    assert got[-1].name == "Room 299"

    # And when a limit does cut the list, it cuts in a stable order
    # (by building, then name), not by when the row was stored.
    names = [p.name for p in place_service.search_places(session, kind="indoor", limit=5)]
    assert names == ["Room 000", "Room 001", "Room 002", "Room 003", "Room 004"]


def test_search_puts_names_that_start_with_the_text_first(session):
    for i, name in enumerate(["Old Lab 1", "Lab 2", "Lab 1"]):
        session.add(Place(osm_type="node", osm_id=f"-{i}", kind="indoor",
                          name=name, lat=0, lon=0))
    session.flush()
    names = [p.name for p in place_service.search_places(session, q="lab")]
    assert names == ["Lab 1", "Lab 2", "Old Lab 1"]


def test_nearest_first_when_a_position_is_given(session):
    for i, (name, lat) in enumerate([("far", -8.95), ("near", -8.9401), ("mid", -8.942)]):
        session.add(Place(osm_type="node", osm_id=f"-{i}", kind="indoor",
                          name=name, lat=lat, lon=33.41))
    session.flush()
    got = place_service.search_places(session, lat=-8.94, lon=33.41, radius_m=5000)
    assert [p.name for p in got] == ["near", "mid", "far"]
    assert [p.name for p in place_service.search_places(session, lat=-8.94, lon=33.41, radius_m=5000, limit=1)] == ["near"]


def _node(lat, lon, **tags):
    return {"lat": lat, "lon": lon, "tags": tags}


def test_alt_name_reaches_the_summary_for_a_door_node(session):
    nodes = {"-1": _node(-8.94, 33.41, name="Room 12", door="yes", level="1",
                         building_name="Library", alt_name="Computer Lab;ICT Lab")}
    ingest_indoor_places(nodes, [], session)
    session.flush()
    got = place_service.search_places(session, kind="indoor")[0]
    assert got.alt_names == "Computer Lab;ICT Lab"
    # ...and searching by the alternative name finds the room.
    assert [p.name for p in place_service.search_places(session, q="ict lab")] == ["Room 12"]


def test_alt_name_on_the_room_polygon_is_passed_to_its_door(session):
    nodes = {
        "-1": _node(-8.94, 33.41, name="Room 12", door="yes", level="1", building_name="Library"),
        "-2": _node(-8.9401, 33.41),
        "-3": _node(-8.9401, 33.4101),
        "-4": _node(-8.94, 33.4101),
    }
    ways = [{"id": "-50", "tags": {"indoor": "room", "name": "Room 12", "level": "1",
                                   "building_name": "Library", "alt_name": "Dean's Office"},
             "refs": ["-1", "-2", "-3", "-4", "-1"]}]
    ingest_indoor_places(nodes, ways, session)
    session.flush()
    assert session.query(Place).filter_by(osm_id="-1").one().alt_names == "Dean's Office"


def test_door_own_alt_name_wins_over_the_polygon(session):
    nodes = {
        "-1": _node(-8.94, 33.41, name="Room 12", door="yes", level="1",
                    building_name="Library", alt_name="Door value"),
        "-2": _node(-8.9401, 33.41), "-3": _node(-8.9401, 33.4101), "-4": _node(-8.94, 33.4101),
    }
    ways = [{"id": "-50", "tags": {"indoor": "room", "level": "1", "alt_name": "Polygon value"},
             "refs": ["-1", "-2", "-3", "-4", "-1"]}]
    ingest_indoor_places(nodes, ways, session)
    session.flush()
    assert session.query(Place).filter_by(osm_id="-1").one().alt_names == "Door value"


def _square(i):
    base = i * 0.0001
    return {f"-{i}1": _node(-8.94, 33.41 + base), f"-{i}2": _node(-8.9401, 33.41 + base),
            f"-{i}3": _node(-8.9401, 33.4101 + base)}


def test_stairs_polygon_is_stored_and_not_searchable(session):
    nodes = _square(1)
    ways = [{"id": "-70", "tags": {"indoor": "stairs", "level": "0", "building_name": "Library"},
             "refs": ["-11", "-12", "-13", "-11"]}]
    counts = ingest_indoor_places(nodes, ways, session)
    session.flush()
    assert counts["areas"] == 1
    row = session.query(IndoorArea).one()
    assert (row.type, row.level, row.name, row.building_name) == ("stairs", "0", "stairs", "Library")
    assert place_service.search_places(session) == []   # areas are never places


def test_a_stair_serving_two_floors_is_drawn_on_both(session):
    nodes = _square(1)
    ways = [{"id": "-70", "tags": {"indoor": "stairs", "level": "0;1", "building_name": "Library"},
             "refs": ["-11", "-12", "-13", "-11"]}]
    counts = ingest_indoor_places(nodes, ways, session)
    session.flush()
    assert counts["areas"] == 2
    rows = {r.level: r.osm_id for r in session.query(IndoorArea).all()}
    assert rows == {"0": "-70", "1": "-70@1"}

    # Running the ingest again does not duplicate them.
    ingest_indoor_places(nodes, ways, session)
    session.flush()
    assert session.query(IndoorArea).count() == 2


def test_a_room_with_two_levels_still_uses_the_first_only(session):
    nodes = _square(1)
    ways = [{"id": "-71", "tags": {"indoor": "room", "name": "Hall", "level": "0;1"},
             "refs": ["-11", "-12", "-13", "-11"]}]
    counts = ingest_indoor_places(nodes, ways, session)
    session.flush()
    assert counts["areas"] == 1
    assert session.query(IndoorArea).one().level == "0"
