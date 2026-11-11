"""Acceptance tests for the route pipeline, run against the real basin-explorer data.

The route is built once per session; set BASIN_EXPLORER_ROOT to point at another checkout.
"""
import json
import os
from pathlib import Path

import numpy as np
import pytest
import shapely

import build_route
import route_geom

SOURCE = Path(os.environ.get("BASIN_EXPLORER_ROOT", build_route.DEFAULT_SOURCE_ROOT))
OUT_FILE = Path(__file__).resolve().parent.parent / "public" / "data" / "route.json"

pytestmark = pytest.mark.skipif(not SOURCE.exists(), reason=f"basin-explorer not found at {SOURCE}")


@pytest.fixture(scope="module")
def route():
    return build_route.build_route(SOURCE)


def test_one_ordered_polyline_of_371_reaches(route):
    reaches = route["reaches"]
    assert len(reaches) == 371
    assert reaches[0]["id"] == 61546168
    assert reaches[-1]["id"] == 61560077
    kms = np.asarray(route["real"]["km"])
    assert kms[0] == 0
    assert np.all(np.diff(kms) > 0)
    for a, b in zip(reaches, reaches[1:]):
        assert a["endKm"] == pytest.approx(b["startKm"], abs=1e-6)


def test_distance_to_sea_strictly_decreasing(route):
    d = [r["distanceToSeaKm"] for r in route["reaches"]]
    assert all(a > b for a, b in zip(d, d[1:]))


def test_four_named_segments_in_order_and_contiguous(route):
    segs = route["segments"]
    assert [s["river"] for s in segs] == ["alumine", "collon-cura", "limay", "negro"]
    assert [s["name"] for s in segs] == ["Aluminé", "Collón Curá", "Limay", "Negro"]
    assert segs[0]["startKm"] == 0 and segs[0]["startS"] == 0
    for a, b in zip(segs, segs[1:]):
        assert a["endKm"] == pytest.approx(b["startKm"], abs=1e-6)
        assert a["endS"] == pytest.approx(b["startS"], abs=1e-6)
    assert segs[-1]["endKm"] == pytest.approx(route["realLengthKm"], abs=1e-6)
    assert segs[-1]["endS"] == pytest.approx(route["gameLengthM"], abs=1e-6)


def test_route_ends_at_the_mouth(route):
    lon, lat = route["real"]["lon"][-1], route["real"]["lat"][-1]
    assert lon == pytest.approx(-62.802, abs=0.01)
    assert lat == pytest.approx(-40.994, abs=0.01)
    c = route["centerline"]
    assert c["lon"][-1] == pytest.approx(-62.802, abs=0.01)
    assert c["lat"][-1] == pytest.approx(-40.994, abs=0.01)


def test_total_lengths(route):
    assert route["realLengthKm"] == pytest.approx(1292.8, rel=0.01)
    assert route["gameLengthM"] == pytest.approx(1292.8e3 / 40, rel=0.01)
    c = route["centerline"]
    assert (c["n"] - 1) * c["spacingM"] == pytest.approx(route["gameLengthM"], rel=1e-4)


def test_centerline_is_smooth_and_simple(route):
    c = route["centerline"]
    xy = np.c_[c["x"], c["y"]]
    corridor = route["params"]["corridorHalfWidthM"]
    assert corridor == 300
    assert route_geom.min_bend_radius(xy, c["spacingM"]) > corridor  # adjacent-sample estimator
    assert shapely.LineString(xy).is_simple


def test_centerline_columns_are_consistent(route):
    c = route["centerline"]
    n = c["n"]
    for key in ("x", "y", "lon", "lat", "km", "elevM", "dischargeM3s", "widthM", "river", "lake"):
        assert len(c[key]) == n, key
    assert np.all(np.diff(c["km"]) >= 0)
    assert all(0 <= r < 4 for r in c["river"])
    assert all(np.diff(c["river"]) >= 0)
    assert 25 <= min(c["widthM"]) and max(c["widthM"]) <= 130


def test_reservoirs_and_dams_in_downstream_order(route):
    res = route["reservoirs"]
    names = [r["name"] for r in res]
    assert names == ["Piedra del Águila", "Pichi Picún Leufú", "El Chocón", "Arroyito"]
    assert not any("Alicur" in r["name"] for r in res)
    assert not any("Alicur" in lm["name"] for lm in route["landmarks"])
    prev = 0.0
    for r in res:
        assert prev <= r["startKm"] < r["endKm"]
        assert r["startKm"] <= r["damKm"] <= r["endKm"] + 2.0
        assert r["startS"] < r["endS"]
        prev = r["endKm"]
    # the lake flag along the centerline matches the reservoir spans
    c = route["centerline"]
    assert sorted(set(c["lake"])) == [0, 1, 2, 3, 4]
    assert res[2]["id"] == "el-chocon"


def test_landmarks_have_route_distance_in_real_order(route):
    lms = route["landmarks"]
    km = [lm["km"] for lm in lms]
    assert km == sorted(km)
    towns = {lm["name"]: lm for lm in lms if lm["kind"] == "town"}
    for name in ("Aluminé", "Piedra del Águila", "Picún Leufú", "Neuquén", "Cipolletti", "General Roca",
                 "Villa Regina", "Choele Choel", "Viedma", "El Cóndor"):
        assert name in towns, name
        assert 0 <= towns[name]["s"] <= route["gameLengthM"]
    order = ["Aluminé", "Piedra del Águila", "Picún Leufú", "Neuquén", "Cipolletti", "General Roca",
             "Villa Regina", "Choele Choel", "Viedma", "El Cóndor"]
    assert [towns[n]["km"] for n in order] == sorted(towns[n]["km"] for n in order)
    assert all(lm["offRouteKm"] <= build_route.TOWN_MAX_OFFSET_KM for lm in towns.values())
    kinds = {lm["kind"] for lm in lms}
    assert {"town", "confluence", "dam", "source", "sea"} <= kinds
    conf = [lm["name"] for lm in lms if lm["kind"] == "confluence"]
    assert conf == ["Aluminé – Collón Curá", "Collón Curá – Limay", "Limay – Negro"]
    dams = [lm["name"] for lm in lms if lm["kind"] == "dam"]
    assert len(dams) == 4


def test_written_file_parses_and_is_small():
    assert OUT_FILE.exists(), "run: .venv/bin/python tools/build_route.py"
    assert OUT_FILE.stat().st_size <= 300_000
    data = json.loads(OUT_FILE.read_text(encoding="utf-8"))
    assert data["version"] == 1
    assert data["centerline"]["n"] == len(data["centerline"]["x"])
