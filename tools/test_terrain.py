"""Acceptance tests for the terrain strip written by build_terrain.py (public/data/terrain)."""
import json
from pathlib import Path

import numpy as np
import pytest
import rasterio

import terrain_geom as tg

TERRAIN = tg.ROOT / "public" / "data" / "terrain"


@pytest.fixture(scope="module")
def route():
    return tg.load_route()


@pytest.fixture(scope="module")
def manifest():
    path = TERRAIN / "manifest.json"
    assert path.exists(), f"{path} missing: run tools/build_terrain.py"
    return json.loads(path.read_text())


@pytest.fixture(scope="module")
def strip(manifest):
    """Decoded strip in game metres, shape (stations, columns)."""
    cols = manifest["columns"]
    rows = []
    for ch in manifest["chunks"]:
        raw = np.fromfile(TERRAIN / ch["file"], dtype="<u2")
        rows.append(raw.reshape(ch["count"], cols))
    raw = np.vstack(rows)
    enc = manifest["encoding"]
    return enc["heightMin"] + raw.astype(np.float64) * enc["heightStep"]


@pytest.fixture(scope="module")
def water(manifest):
    return np.asarray(manifest["water"]["levels"], dtype=float)


def test_dimensions_match_manifest(manifest, strip, route):
    n, cols = manifest["stations"], manifest["columns"]
    assert strip.shape == (n, cols)
    assert sum(c["count"] for c in manifest["chunks"]) == n
    assert [c["start"] for c in manifest["chunks"]] == list(np.cumsum([0] + [c["count"] for c in manifest["chunks"]])[:-1])
    for c in manifest["chunks"]:
        assert (TERRAIN / c["file"]).stat().st_size == c["count"] * cols * 2
    res, half = manifest["resolutionM"], manifest["halfWidthM"]
    assert cols == int(round(2 * half / res)) + 1
    assert n == int(route["gameLengthM"] // res) + 1
    assert len(manifest["water"]["levels"]) == n
    for key in ("lateralScale", "verticalScale", "referenceM", "chunkStations"):
        assert key in manifest["params"]


def test_no_nodata_holes(manifest, strip, water):
    assert np.isfinite(strip).all() and np.isfinite(water).all()
    enc = manifest["encoding"]
    assert strip.min() == pytest.approx(manifest["minHeight"], abs=enc["heightStep"])
    assert strip.max() == pytest.approx(manifest["maxHeight"], abs=enc["heightStep"])
    assert manifest["maxHeight"] > manifest["minHeight"]
    # A hole would show as a flat all-equal row or an isolated spike against its row neighbours.
    assert (strip.max(axis=1) - strip.min(axis=1) > 0).all()


def test_water_monotone_and_zero_at_mouth(water):
    assert (np.diff(water) <= 1e-9).all()
    assert abs(water[-1]) < 0.05
    assert water[0] > 50  # Lago Alumine outlet is ~1150 m a.s.l. -> >100 game m at vertical scale 8


def test_channel_centre_below_banks(manifest, strip, water, route):
    res, half = manifest["resolutionM"], manifest["halfWidthM"]
    c = route["centerline"]
    s = np.arange(manifest["stations"]) * res
    width = np.interp(s, np.arange(c["n"]) * c["spacingM"], c["widthM"])
    centre = int(round(half / res))
    off = np.ceil(width / 2 / res).astype(int) + 1  # half-width plus a small margin of one column
    rows = np.arange(len(s))
    left, right = strip[rows, centre - off], strip[rows, centre + off]
    assert (strip[:, centre] < left).all() and (strip[:, centre] < right).all()
    tol = manifest["encoding"]["heightStep"] + 0.006  # quantisation + water rounding
    assert (water <= left + tol).all() and (water <= right + tol).all()
    assert (strip[:, centre] < water).all()


def test_reservoirs_flat_with_step_at_dam(manifest, water, route):
    res = manifest["resolutionM"]
    assert len(route["reservoirs"]) == 4
    for r in route["reservoirs"]:
        i0, i1 = int(round(r["startS"] / res)), int(round(r["damS"] / res))
        assert np.ptp(water[i0 : i1 + 1]) == 0.0, r["id"]
        assert water[i1 + 1] < water[i1] - 0.5, f"no step down at the {r['id']} dam"
        assert water[i0 - 1] >= water[i0]


def test_sample_matches_direct_dem_read(manifest, strip, water, route):
    """A bank sample, away from the carved channel, equals a direct rasterio read at its real lon/lat."""
    p = manifest["params"]
    frame = tg.build_frame(route, manifest["resolutionM"], p["crossSmoothKm"])
    res, half = manifest["resolutionM"], manifest["halfWidthM"]
    col_of = lambda d: int(round((d + half) / res))  # noqa: E731
    checked = 0
    for i in range(frame.n // 2, frame.n, 400):  # Negro valley: gentle terrain, tiles far from the dam steps
        for d in (-250.0, 250.0):
            lon, lat = tg.sample_lonlat(frame, slice(i, i + 1), [d], p["lateralScale"])
            lon, lat = float(lon[0, 0]), float(lat[0, 0])
            lat0, lon0 = int(np.floor(lat)), int(np.floor(lon))
            path = tg.DEM_DIR / f"{tg.tile_name(lat0, lon0)}.tif"
            if not path.exists():
                continue
            with rasterio.open(path) as ds:
                r, c = ds.index(lon, lat)
                win = ds.read(1, window=((r - 1, r + 2), (c - 1, c + 2)))
                if win.max() - win.min() > 3.0:
                    continue  # steep spot: nearest-vs-bilinear would differ by design
                direct = float(ds.read(1, window=((r, r + 1), (c, c + 1)))[0, 0])
            expected = (direct - p["referenceM"]) / p["verticalScale"]
            if expected < water[i] + 1.0:
                continue  # below/near the water floor, where the carve legitimately raises the terrain
            assert strip[i, col_of(d)] == pytest.approx(expected, abs=0.6 / p["verticalScale"] + 0.02)
            checked += 1
    assert checked >= 5


def test_parameters_are_cli_options():
    import build_terrain

    args = build_terrain.parse_args(["--lateral-scale", "6", "--vertical-scale", "5", "--resolution", "4", "--half-width", "200"])
    assert (args.lateral_scale, args.vertical_scale, args.resolution, args.half_width) == (6.0, 5.0, 4.0, 200.0)


def test_water_surface_unit():
    import build_terrain as bt

    raw = np.r_[np.linspace(100, 60, 50), np.linspace(70, 20, 50)]  # noisy rise at the dam, falling river
    out = bt.water_surface(raw, [(10, 40)], np.linspace(500e3, 0, 100), 5, 3)
    assert (np.diff(out) <= 1e-9).all() and out[-1] == 0.0
    assert np.ptp(out[10:41]) == 0.0 and out[41] < out[40]


def test_fill_holes_leaves_no_nan():
    import build_terrain as bt

    a = np.arange(30, dtype=np.float32).reshape(5, 6)
    a[1, 2:4] = np.nan
    a[3, :] = np.nan
    out = bt.fill_holes(a.copy())
    assert np.isfinite(out).all() and out[1, 2] == a[1, 1] and out[1, 3] == a[1, 4]
