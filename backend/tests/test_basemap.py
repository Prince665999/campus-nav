"""Tests for the outdoor base map built from map.osm."""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.api.errors import http_exception_handler
from backend.api.routers import basemap as basemap_router
from backend.api.services import basemap_service

OSM = """<?xml version='1.0' encoding='UTF-8'?>
<osm version='0.6'>
 <node id='1' lat='-8.9400' lon='33.4100'/>
 <node id='2' lat='-8.9400' lon='33.4110'/>
 <node id='3' lat='-8.9410' lon='33.4110'/>
 <node id='4' lat='-8.9410' lon='33.4100'/>
 <node id='5' lat='-8.9420' lon='33.4100'/>
 <node id='6' lat='-8.9420' lon='33.4120'/>
 <node id='7' lat='-8.9430' lon='33.4110'/>
 <way id='10'><nd ref='1'/><nd ref='2'/><nd ref='3'/><nd ref='4'/><nd ref='1'/>
   <tag k='building' v='university'/><tag k='name' v='Library'/></way>
 <way id='11'><nd ref='5'/><nd ref='6'/><tag k='highway' v='residential'/></way>
 <way id='12'><nd ref='5'/><nd ref='7'/><tag k='highway' v='footway'/></way>
 <way id='13'><nd ref='4'/><nd ref='5'/><nd ref='7'/><nd ref='4'/>
   <tag k='landuse' v='grass'/><tag k='name' v='Quad'/></way>
 <way id='14'><nd ref='2'/><nd ref='6'/><nd ref='7'/><nd ref='2'/><tag k='landuse' v='residential'/></way>
 <way id='15'><nd ref='1'/><nd ref='7'/><tag k='barrier' v='fence'/></way>
 <way id='16'><nd ref='1'/><nd ref='999'/><tag k='highway' v='footway'/></way>
 <way id='17'><nd ref='1'/><nd ref='2'/><nd ref='3'/><tag k='building' v='yes'/></way>
 <way id='18'><nd ref='3'/><nd ref='6'/><tag k='highway' v='proposed'/></way>
</osm>
"""


@pytest.fixture
def osm_file(tmp_path):
    p = tmp_path / "map.osm"
    p.write_text(OSM)
    return p


def test_the_right_things_go_in_the_right_layers(osm_file):
    data = basemap_service.build_base_map(osm_file)
    layers = data["layers"]
    count = {k: len(v["features"]) for k, v in layers.items()}

    assert count["buildings"] == 1                  # the open way "17" is not a closed building
    assert count["roads"] == 1
    assert count["paths"] == 1                      # way 16 has a missing node: only 1 point, skipped
    assert count["green"] == 1
    assert count["landuse"] == 1                    # residential land use, not green
    assert count["water"] == 0 and count["waterways"] == 0


def test_names_kinds_and_geometry(osm_file):
    layers = basemap_service.build_base_map(osm_file)["layers"]
    building = layers["buildings"]["features"][0]
    assert building["properties"] == {"kind": "university", "name": "Library"}
    ring = building["geometry"]["coordinates"][0]
    assert building["geometry"]["type"] == "Polygon"
    assert ring[0] == ring[-1] and len(ring) == 5
    assert ring[0] == [33.41, -8.94]                # [lon, lat], the order MapLibre wants

    road = layers["roads"]["features"][0]
    assert road["geometry"]["type"] == "LineString"
    assert road["properties"] == {"kind": "residential"}   # no name: no name key
    assert layers["green"]["features"][0]["properties"]["name"] == "Quad"


def test_unknown_and_unwanted_ways_are_left_out(osm_file):
    data = basemap_service.build_base_map(osm_file)
    everything = json.dumps(data["layers"])
    assert "fence" not in everything and "proposed" not in everything


def test_bounds_cover_what_is_drawn(osm_file):
    b = basemap_service.build_base_map(osm_file)["bounds"]
    assert b == [33.41, -8.943, 33.412, -8.94]


def test_open_area_ring_is_closed_for_us():
    # a landuse way that is closed in the file stays closed; polygons always end where they start
    import tempfile, pathlib
    d = pathlib.Path(tempfile.mkdtemp())
    (d / "m.osm").write_text(OSM)
    ring = basemap_service.build_base_map(d / "m.osm")["layers"]["green"]["features"][0]["geometry"]["coordinates"][0]
    assert ring[0] == ring[-1]


def test_version_is_stable_and_changes_with_the_map(osm_file, tmp_path):
    v1 = basemap_service.build_base_map(osm_file)["version"]
    assert v1 == basemap_service.build_base_map(osm_file)["version"]

    other = tmp_path / "other.osm"
    other.write_text(OSM.replace("Library", "Library Block"))
    assert basemap_service.build_base_map(other)["version"] != v1


def test_a_missing_file_gives_none(tmp_path):
    assert basemap_service.get_base_map(tmp_path / "nope.osm") is None


def test_cache_is_reused_then_rebuilt_when_the_file_changes(osm_file):
    first = basemap_service.get_base_map(osm_file)
    assert basemap_service.get_base_map(osm_file) is not None
    assert basemap_service.get_base_map(osm_file)[1] is first[1]       # same cached bytes

    osm_file.write_text(OSM.replace("Library", "Science Block"))
    second = basemap_service.get_base_map(osm_file)
    assert second[0] != first[0]
    assert b"Science Block" in second[1]


@pytest.fixture
def client(osm_file, monkeypatch):
    monkeypatch.setattr(basemap_service, "MAP_OSM_PATH", osm_file)
    app = FastAPI()
    app.include_router(basemap_router.router)
    from fastapi import HTTPException
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(Exception, http_exception_handler)
    return TestClient(app, raise_server_exceptions=False)


def test_endpoints(client):
    full = client.get("/api/basemap")
    assert full.status_code == 200
    body = full.json()
    assert set(body["layers"]) == set(basemap_service.LAYER_NAMES)
    assert client.get("/api/basemap/version").json() == {"version": body["version"]}


def test_endpoint_404_when_the_file_is_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(basemap_service, "MAP_OSM_PATH", tmp_path / "none.osm")
    app = FastAPI()
    app.include_router(basemap_router.router)
    from fastapi import HTTPException
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(Exception, http_exception_handler)
    c = TestClient(app, raise_server_exceptions=False)
    assert c.get("/api/basemap").status_code == 404
    assert c.get("/api/basemap/version").status_code == 404


# ---------------------------------------------------------------------------
# Parking, pitches, symbols (points of interest) and trees
# ---------------------------------------------------------------------------

OSM2 = """<?xml version='1.0' encoding='UTF-8'?>
<osm version='0.6'>
 <node id='1' lat='-8.9400' lon='33.4100'/>
 <node id='2' lat='-8.9400' lon='33.4110'/>
 <node id='3' lat='-8.9410' lon='33.4110'/>
 <node id='4' lat='-8.9410' lon='33.4100'/>
 <node id='20' lat='-8.9500' lon='33.4200'>
   <tag k='amenity' v='clinic'/><tag k='name' v='MUST Dispensary'/></node>
 <node id='21' lat='-8.9501' lon='33.4201'><tag k='amenity' v='parking'/></node>
 <node id='22' lat='-8.9502' lon='33.4202'><tag k='shop' v='kiosk'/></node>
 <node id='23' lat='-8.9503' lon='33.4203'><tag k='amenity' v='bench'/></node>
 <node id='24' lat='-8.9504' lon='33.4204'><tag k='natural' v='tree'/></node>
 <node id='25' lat='-8.9505' lon='33.4205'><tag k='barrier' v='gate'/><tag k='name' v='MUST Main Gate'/></node>
 <node id='26' lat='-8.9506' lon='33.4206'><tag k='highway' v='bus_stop'/></node>
 <node id='27' lat='-8.9507' lon='33.4207'><tag k='highway' v='crossing'/></node>
 <node id='28' lat='-8.9508' lon='33.4208'><tag k='amenity' v='fountain'/></node>
 <way id='30'><nd ref='1'/><nd ref='2'/><nd ref='3'/><nd ref='4'/><nd ref='1'/>
   <tag k='building' v='yes'/><tag k='amenity' v='library'/><tag k='name' v='Dr. Magufuli Library'/></way>
 <way id='31'><nd ref='1'/><nd ref='2'/><nd ref='3'/><nd ref='4'/><nd ref='1'/>
   <tag k='building' v='yes'/><tag k='name' v='Block 8D Hostel'/></way>
 <way id='32'><nd ref='1'/><nd ref='2'/><nd ref='3'/><nd ref='4'/><nd ref='1'/><tag k='amenity' v='parking'/></way>
 <way id='33'><nd ref='1'/><nd ref='2'/><nd ref='3'/><nd ref='4'/><nd ref='1'/>
   <tag k='leisure' v='pitch'/><tag k='sport' v='volleyball'/><tag k='name' v='Volleyball'/></way>
 <way id='34'><nd ref='1'/><nd ref='2'/><nd ref='3'/><nd ref='4'/><nd ref='1'/>
   <tag k='leisure' v='sports_centre'/><tag k='name' v='MUST Playgrounds'/></way>
 <way id='35'><nd ref='1'/><nd ref='2'/><nd ref='3'/><nd ref='4'/><nd ref='1'/>
   <tag k='amenity' v='university'/><tag k='name' v='Mbeya University of Science and Technology'/></way>
 <way id='36'><nd ref='1'/><nd ref='2'/><nd ref='3'/><nd ref='4'/><nd ref='1'/>
   <tag k='landuse' v='education'/></way>
 <way id='37'><nd ref='1'/><nd ref='3'/><tag k='highway' v='pedestrian'/></way>
</osm>
"""


@pytest.fixture
def osm2(tmp_path):
    p = tmp_path / "map2.osm"
    p.write_text(OSM2)
    return basemap_service.build_base_map(p)["layers"]


def _names(layer):
    return [f["properties"].get("name") for f in layer["features"]]


def test_parking_areas_pitches_and_sports_centres_have_their_own_layers(osm2):
    assert len(osm2["parking"]["features"]) == 1
    assert [f["properties"]["kind"] for f in osm2["sports"]["features"]] == ["pitch", "sports_centre"]
    assert _names(osm2["sports"]) == ["Volleyball", "MUST Playgrounds"]


def test_the_campus_education_area_goes_in_the_landuse_layer(osm2):
    kinds = sorted(f["properties"]["kind"] for f in osm2["landuse"]["features"])
    assert kinds == ["education", "university"]
    assert "Mbeya University of Science and Technology" in _names(osm2["landuse"])


def test_pedestrian_ways_are_drawn_as_roads(osm2):
    assert [f["properties"]["kind"] for f in osm2["roads"]["features"]] == ["pedestrian"]


def test_symbols_for_places_with_and_without_names(osm2):
    pois = {(f["properties"].get("icon"), f["properties"].get("name")) for f in osm2["pois"]["features"]}
    assert ("medical", "MUST Dispensary") in pois              # named clinic: symbol + name
    assert ("parking", None) in pois                           # unnamed parking: symbol only
    assert ("shop", None) in pois                              # unnamed kiosk
    assert ("bus", None) in pois                               # bus stop
    assert (None, "MUST Main Gate") in pois                    # named gate: name only, no symbol


def test_street_furniture_and_unknown_unnamed_things_are_left_out(osm2):
    icons = [f["properties"].get("icon") for f in osm2["pois"]["features"]]
    text = json.dumps(osm2["pois"])
    assert "bench" not in text and "crossing" not in text and "fountain" not in text
    assert icons.count(None) == 1                               # only the named gate


def test_trees_are_their_own_points(osm2):
    assert len(osm2["trees"]["features"]) == 1
    assert osm2["trees"]["features"][0]["geometry"]["type"] == "Point"
    assert "natural" not in json.dumps(osm2["pois"])           # trees are not symbols


def test_a_building_that_is_a_place_gets_one_symbol_at_its_centre_and_carries_the_name(osm2):
    library = [f for f in osm2["pois"]["features"] if f["properties"].get("icon") == "library"]
    assert len(library) == 1
    assert library[0]["properties"]["name"] == "Dr. Magufuli Library"
    lon, lat = library[0]["geometry"]["coordinates"]
    assert lon == 33.4105 and lat == -8.9405   # the exact middle of the square


def test_the_polygon_of_a_place_is_marked_so_its_name_is_not_written_twice(osm2):
    by_name = {f["properties"].get("name"): f["properties"] for f in osm2["buildings"]["features"]}
    assert by_name["Dr. Magufuli Library"].get("poi") is True
    assert "poi" not in by_name["Block 8D Hostel"]              # an ordinary building keeps its own label


def test_a_parking_area_gets_a_p_symbol_too(osm2):
    assert osm2["parking"]["features"][0]["properties"].get("poi") is True
    assert any(f["properties"].get("icon") == "parking" and f["geometry"]["coordinates"] == [33.4105, -8.9405]
               for f in osm2["pois"]["features"])


def test_icon_names_match_the_picture_files():
    import pathlib
    icons = set(basemap_service.POI_ICONS.values()) | {"generic"}
    assets = pathlib.Path(__file__).resolve().parents[2] / "mobile" / "assets" / "poi"
    if assets.exists():   # the picture files live in the app folder
        have = {p.stem for p in assets.glob("*.png")}
        assert icons - {"generic"} <= have


def test_centroid_is_exact_at_real_coordinates():
    # A 30 m x 12 m hall at the campus location. Measuring from the origin
    # would put the centre metres out.
    lat0, lon0 = -8.9402, 33.4103
    import math
    d_lat = 12 / 110540
    d_lon = 30 / (111320 * math.cos(math.radians(8.94)))
    ring = [[lon0, lat0], [lon0 + d_lon, lat0], [lon0 + d_lon, lat0 + d_lat], [lon0, lat0 + d_lat], [lon0, lat0]]
    lon, lat = basemap_service._centroid(ring)
    err_m = math.hypot((lon - (lon0 + d_lon / 2)) * 111320 * math.cos(math.radians(8.94)),
                       (lat - (lat0 + d_lat / 2)) * 110540)
    assert err_m < 0.2        # coordinates are rounded to 1e-6 degrees (about 0.1 m)
