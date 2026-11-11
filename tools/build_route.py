#!/usr/bin/env python3
"""Build public/data/route.json: the stitched Aluminé -> Atlantic main stem and its game-space centerline.

Reads the (read-only) basin-explorer project. Source root: --source-root, or $BASIN_EXPLORER_ROOT, or the default below.

    .venv/bin/python tools/build_route.py            # writes public/data/route.json
    .venv/bin/python tools/build_route.py --report   # also prints the smoothing / no-fold trade-off table
"""
import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
import pyproj
import shapely
from pyogrio.raw import read as read_raw
from shapely.geometry import LineString, Point, Polygon

import route_geom

DEFAULT_SOURCE_ROOT = "/home/faustino/Desktop/Documents/code/basin-explorer"
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = REPO_ROOT / "public" / "data" / "route.json"

START_REACH = 61546168  # Lago Aluminé outlet
END_REACH = 61560077  # Río Negro mouth (NEXT_DOWN = 0)
CORRIDOR_BBOX = (-72.0, -42.0, -62.0, -38.0)  # lon/lat box holding the whole stem

RIVERS = [("alumine", "Aluminé"), ("collon-cura", "Collón Curá"), ("limay", "Limay"), ("negro", "Negro")]

# (id, display name, full name, HydroLAKES id, IGN dam-wall ids). Alicurá is off-route on purpose.
RESERVOIRS = [
    ("piedra-del-aguila", "Piedra del Águila", "Embalse Piedra del Águila", 986, [9]),
    ("pichi-picun-leufu", "Pichi Picún Leufú", "Embalse Pichi Picún Leufú", 10580, [8]),
    ("el-chocon", "El Chocón", "Embalse Ezequiel Ramos Mexía", 981, [7]),
    ("arroyito", "Arroyito", "Embalse Arroyito", 10571, [1, 12]),
]

# Landmark selection: cities and towns within TOWN_MAX_OFFSET_KM of the route, villages within
# VILLAGE_MAX_OFFSET_KM, plus a few villages kept up to TOWN_MAX_OFFSET_KM because they name a reservoir or the mouth.
TOWN_MAX_OFFSET_KM = 9.0
VILLAGE_MAX_OFFSET_KM = 3.0
KEEP_VILLAGES = {"Piedra del Águila", "Picún Leufú", "El Cóndor"}

COMPRESSION = 40.0  # real route metres per game metre, along the route
GRID_M = 250.0  # real-space working resolution for smoothing

DEFAULTS = dict(
    smoothing_km=2.0,  # Gaussian sigma of the real centerline smoothing (curvature limiter does the rest)
    corridor_half_width_m=300.0,  # terrain strip half-width in game metres (T3)
    min_radius_margin=1.1,  # target min bend radius = corridor * margin
    spacing_m=20.0,  # centerline sample spacing in game metres
    lake_width_m=120.0,  # game channel width on reservoirs
    width_range_m=(25.0, 60.0),  # game channel width from discharge
)

def read_ndjson(path):
    with open(path, encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]

def load_stem(src):
    """Walk NEXT_DOWN from START_REACH to END_REACH. Returns the ordered reach records with lon/lat vertices."""
    shp = src / "data/raw/hydrorivers/HydroRIVERS_v10_sa_shp/HydroRIVERS_v10_sa.shp"
    # A bbox read is used instead of where="MAIN_RIV = ...": the attribute filter returns no rows on this shapefile.
    _, _, geoms, fields = read_raw(shp, bbox=CORRIDOR_BBOX, columns=["HYRIV_ID", "NEXT_DOWN"])
    geo = {int(i): g for i, g in zip(fields[0], geoms)}
    nxt = {int(i): int(n) for i, n in zip(fields[0], fields[1])}
    stem_ids, cur = [], START_REACH
    while cur:
        stem_ids.append(cur)
        cur = nxt[cur]
    wanted = set(stem_ids)
    attrs = {}
    with open(src / "data/out/nqn/reaches.ndjson", encoding="utf-8") as fh:  # streamed; only main-stem rows are kept
        for line in fh:
            if not line.strip():
                continue
            row = json.loads(line)
            if row["_id"] in wanted:
                attrs[row["_id"]] = row
    reaches = []
    for rid in stem_ids:
        coords = np.array(shapely.from_wkb(geo[rid]).coords)[:, :2]
        reaches.append(dict(id=rid, coords=coords, attrs=attrs[rid]))
    return reaches

def stitch(reaches):
    """Concatenate reach geometry in flow order, dropping the duplicated junction vertex.

    Returns lon/lat vertices, for each reach the index of its first vertex (the junction shared with the
    previous reach), and geodesic cumulative km.
    """
    verts = [reaches[0]["coords"]]
    first = [0]
    count = len(reaches[0]["coords"])
    for prev, r in zip(reaches, reaches[1:]):
        c = r["coords"]
        if not np.allclose(prev["coords"][-1], c[0], atol=1e-6):
            raise ValueError(f"reach {r['id']} does not start where {prev['id']} ends")
        first.append(count - 1)
        verts.append(c[1:])
        count += len(c) - 1
    lonlat = np.vstack(verts)
    geod = pyproj.Geod(ellps="WGS84")
    seg = geod.inv(lonlat[:-1, 0], lonlat[:-1, 1], lonlat[1:, 0], lonlat[1:, 1])[2]
    km = np.r_[0.0, np.cumsum(seg)] / 1000.0
    return lonlat, first, km

def build_route(source_root, **overrides):
    p = {**DEFAULTS, **overrides}
    src = Path(source_root)
    reaches = load_stem(src)
    lonlat, first, km = stitch(reaches)
    total_km = float(km[-1])

    # reach spans in km: reach i covers vertices first[i] .. first[i+1] (shared junction vertex)
    first_idx = list(first) + [len(lonlat) - 1]
    for i, r in enumerate(reaches):
        r["startKm"], r["endKm"] = float(km[first_idx[i]]), float(km[first_idx[i + 1]])

    tm = pyproj.Transformer.from_crs(4326, "+proj=tmerc +lat_0=-40 +lon_0=-67 +k=1 +ellps=WGS84", always_xy=True)
    px, py = tm.transform(lonlat[:, 0], lonlat[:, 1])
    tm_xy = np.c_[px, py]
    tm_arc = route_geom.arc_length(tm_xy)  # TM metres along the true polyline
    km_of_arc = lambda a: np.interp(a, tm_arc, km)  # noqa: E731
    arc_of_km = lambda k: np.interp(k, km, tm_arc)  # noqa: E731

    grid, grid_arc = route_geom.resample_uniform(tm_xy, GRID_M)
    grid_km = km_of_arc(grid_arc)
    step = float(grid_arc[1] - grid_arc[0])  # uniform except the last step; the smoothing assumes uniform
    grid_step = GRID_M

    geom = fit_centerline(grid, grid_step, total_km, p)
    smooth, k_scale = geom["smooth"], geom["scale"]
    s_fine = route_geom.arc_length(smooth) * k_scale  # game metres at each grid point
    game_len = float(s_fine[-1])

    # --- reaches ---------------------------------------------------------------------------------------------
    elev_end = np.minimum.accumulate([float(r["attrs"]["catchmentMinElevationM"]) for r in reaches])
    elev_end[-1] = 0.0
    reach_rows = []
    for r, e in zip(reaches, elev_end):
        a = r["attrs"]
        reach_rows.append(
            dict(
                id=r["id"],
                river=a["river"],
                startKm=round(r["startKm"], 3),
                endKm=round(r["endKm"], 3),
                startS=round(float(np.interp(r["startKm"], grid_km, s_fine)), 1),
                distanceToSeaKm=a["distanceToSeaKm"],
                dischargeM3s=a["dischargeM3s"],
                elevEndM=float(e),
            )
        )
    river_ids = [rid for rid, _ in RIVERS]
    names = [r["attrs"]["river"] for r in reaches]
    if sorted(set(names), key=names.index) != river_ids:
        raise ValueError(f"unexpected river sequence: {sorted(set(names), key=names.index)}")

    segments = []
    for rid, label in RIVERS:
        rows = [r for r in reach_rows if r["river"] == rid]
        s0, s1 = rows[0]["startKm"], rows[-1]["endKm"]
        segments.append(
            dict(
                river=rid, name=label, reachFrom=rows[0]["id"], reachTo=rows[-1]["id"], reaches=len(rows),
                startKm=s0, endKm=s1,
                startS=round(float(np.interp(s0, grid_km, s_fine)), 1),
                endS=round(float(np.interp(s1, grid_km, s_fine)), 1),
            )
        )
    segments[0]["startS"] = 0.0
    segments[-1]["endKm"] = round(total_km, 3)
    segments[-1]["endS"] = round(game_len, 1)
    for a, b in zip(segments, segments[1:]):  # make shared boundaries exactly equal after rounding
        b["startKm"], b["startS"] = a["endKm"], a["endS"]

    # --- reservoirs and dams -----------------------------------------------------------------------------------
    route_line = LineString(tm_xy)
    reservoirs = load_reservoirs(src, tm, route_line, tm_arc, km, s_fine, grid_km)

    # --- landmarks ---------------------------------------------------------------------------------------------
    landmarks = build_landmarks(src, tm, route_line, tm_arc, km, grid_km, s_fine, segments, reaches, reservoirs, lonlat)

    # --- centerline ----------------------------------------------------------------------------------------------
    centerline = sample_centerline(
        p, smooth, k_scale, s_fine, grid_km, km, lonlat, reach_rows, reservoirs, game_len, total_km
    )

    diagnostics = dict(
        minBendRadiusM=round(route_geom.min_bend_radius(
            np.c_[centerline["x"], centerline["y"]], centerline["spacingM"]), 1),
        planimetricScale=round(1.0 / k_scale, 3),  # real metres per game metre in the plane (route axis is exactly 40)
        maxLateralDeviationM=round(geom["max_dev_m"] * k_scale, 1),
        limiterPasses=geom["limiter_passes"],
        sinuosityKept={
            seg["river"]: round(
                float(np.hypot(*np.diff(smooth[(grid_km >= seg["startKm"]) & (grid_km <= seg["endKm"])], axis=0).T).sum()
                      / np.hypot(*np.diff(grid[(grid_km >= seg["startKm"]) & (grid_km <= seg["endKm"])], axis=0).T).sum()), 3)
            for seg in segments
        },
    )
    return dict(
        version=1,
        params=dict(
            compressionAlong=COMPRESSION,
            smoothingSigmaKm=p["smoothing_km"],
            corridorHalfWidthM=p["corridor_half_width_m"],
            minRadiusTargetM=round(p["corridor_half_width_m"] * p["min_radius_margin"], 1),
            spacingM=centerline["spacingM"],
            crs="+proj=tmerc +lat_0=-40 +lon_0=-67 +k=1 +ellps=WGS84",
        ),
        realLengthKm=round(total_km, 3),
        gameLengthM=round(game_len, 1),
        diagnostics=diagnostics,
        reaches=reach_rows,
        segments=segments,
        reservoirs=reservoirs,
        landmarks=landmarks,
        real=dict(
            lon=[round(float(v), 5) for v in lonlat[:, 0]],
            lat=[round(float(v), 5) for v in lonlat[:, 1]],
            km=[round(float(v), 3) for v in km],
        ),
        centerline=centerline,
    )

def fit_centerline(grid, step, total_km, p):
    """Smooth the real route and scale it so the route axis is exactly 1:COMPRESSION.

    Returns the smoothed points (TM metres), the planimetric scale k (game m per TM m) and diagnostics.
    The curvature limiter runs in game units, so k is refreshed between passes.
    """
    target_game = p["corridor_half_width_m"] * p["min_radius_margin"]
    smooth = route_geom.gaussian_smooth(grid, p["smoothing_km"] * 1000.0, step)
    passes = 0
    for _ in range(4):
        k = (total_km * 1000.0 / COMPRESSION) / route_geom.arc_length(smooth)[-1]
        if target_game <= 0:
            break
        smooth, used = route_geom.limit_curvature(smooth, step, target_game / k, local_sigma=4000.0, stride_m=0.0)
        passes += used
        if used == 0:
            break
    k = (total_km * 1000.0 / COMPRESSION) / route_geom.arc_length(smooth)[-1]
    dev = shapely.distance(shapely.points(smooth), LineString(grid))
    return dict(smooth=smooth, scale=float(k), max_dev_m=float(dev.max()), limiter_passes=passes)

def width_from_discharge(q, lo, hi, q_lo=20.0, q_hi=1000.0):
    t = (np.log10(np.maximum(q, 1e-3)) - np.log10(q_lo)) / (np.log10(q_hi) - np.log10(q_lo))
    return lo + (hi - lo) * np.clip(t, 0.0, 1.0)

def sample_centerline(p, smooth, k, s_fine, grid_km, km, lonlat, reach_rows, reservoirs, game_len, total_km):
    n = int(np.ceil(game_len / p["spacing_m"])) + 1
    spacing = game_len / (n - 1)
    s = np.arange(n) * spacing
    xy = (smooth - smooth[0]) * k
    x = np.interp(s, s_fine, xy[:, 0])
    y = np.interp(s, s_fine, xy[:, 1])
    kms = np.interp(s, s_fine, grid_km)
    lon = np.interp(kms, km, lonlat[:, 0])
    lat = np.interp(kms, km, lonlat[:, 1])

    ends = np.array([r["endKm"] for r in reach_rows])
    ridx = np.minimum(np.searchsorted(ends, kms, side="left"), len(reach_rows) - 1)
    river_ids = [rid for rid, _ in RIVERS]
    river = np.array([river_ids.index(reach_rows[i]["river"]) for i in ridx])

    mids = np.array([(r["startKm"] + r["endKm"]) / 2 for r in reach_rows])
    q = np.interp(kms, mids, [r["dischargeM3s"] for r in reach_rows])
    knots_km = np.r_[0.0, ends]
    knots_e = np.r_[reach_rows[0]["elevEndM"], [r["elevEndM"] for r in reach_rows]]
    elev = np.interp(kms, knots_km, knots_e)

    lake = np.zeros(n, dtype=int)
    for i, res in enumerate(reservoirs, start=1):
        lake[(kms >= res["startKm"]) & (kms <= res["endKm"])] = i
    # lake widening eases in and out over ~150 game metres
    win = max(3, int(round(150.0 / spacing)) | 1)
    blend = np.convolve(np.pad((lake > 0).astype(float), win, mode="edge"), np.ones(win) / win, "same")[win:-win]
    lo, hi = p["width_range_m"]
    base = width_from_discharge(q, lo, hi)
    width = base + (p["lake_width_m"] - base) * blend

    r1 = lambda a, d=1: [round(float(v), d) for v in a]  # noqa: E731
    return dict(
        n=n,
        spacingM=round(spacing, 4),
        x=r1(x, 2), y=r1(y, 2), lon=r1(lon, 5), lat=r1(lat, 5), km=r1(kms, 3),
        elevM=r1(elev), dischargeM3s=r1(q), widthM=r1(width),
        river=[int(v) for v in river], lake=[int(v) for v in lake],
    )

def load_reservoirs(src, tm, route_line, tm_arc, km, s_fine, grid_km):
    lakes = {f["properties"]["id"]: f for f in json.loads((src / "data/work/nqn/lakes/lakes.geojson").read_text(encoding="utf-8"))["features"]}
    walls = {f["properties"]["id"]: f for f in json.loads((src / "data/work/nqn/tiles/ign_dam_walls.geojson").read_text(encoding="utf-8"))["features"]}
    proj = lambda c: np.c_[tm.transform(c[:, 0], c[:, 1])]  # noqa: E731
    samples = [route_line.interpolate(a) for a in np.arange(0, route_line.length, 100.0)]
    out = []
    for rid, name, full, lake_id, wall_ids in RESERVOIRS:
        poly = shapely.transform(shapely.geometry.shape(lakes[lake_id]["geometry"]), proj)
        inside = np.array([poly.contains(pt) for pt in samples])
        if not inside.any():
            raise ValueError(f"reservoir {name} (HydroLAKES {lake_id}) is not on the walked stem")
        arcs = np.arange(0, route_line.length, 100.0)[inside]
        k0, k1 = float(np.interp(arcs[0], tm_arc, km)), float(np.interp(arcs[-1], tm_arc, km))
        wall_pts = [
            Point(*tm.transform(*c)) for wid in wall_ids for c in walls[wid]["geometry"]["coordinates"]
        ]
        dam_arc = float(np.mean([route_line.project(pt) for pt in wall_pts]))
        dam_km = float(np.interp(dam_arc, tm_arc, km))
        out.append(
            dict(
                id=rid, name=name, fullName=full, lakeId=lake_id,
                startKm=round(k0, 3), endKm=round(k1, 3),
                startS=round(float(np.interp(k0, grid_km, s_fine)), 1),
                endS=round(float(np.interp(k1, grid_km, s_fine)), 1),
                damKm=round(dam_km, 3), damS=round(float(np.interp(dam_km, grid_km, s_fine)), 1),
                damOffRouteKm=round(min(route_line.distance(pt) for pt in wall_pts) / 1000.0, 2),
            )
        )
    return out

def build_landmarks(src, tm, route_line, tm_arc, km, grid_km, s_fine, segments, reaches, reservoirs, lonlat):
    def at(km_value):
        return dict(km=round(float(km_value), 3), s=round(float(np.interp(km_value, grid_km, s_fine)), 1))

    lms = [dict(name="Lago Aluminé", kind="source", **at(0.0), lon=round(float(lonlat[0, 0]), 5),
                lat=round(float(lonlat[0, 1]), 5), offRouteKm=0.0)]
    best = {}
    for r in read_ndjson(src / "data/work/nqn/localities/nodes.ndjson"):
        pt = Point(*tm.transform(r["lon"], r["lat"]))
        off = route_line.distance(pt) / 1000.0
        limit = VILLAGE_MAX_OFFSET_KM if r["place"] == "village" else TOWN_MAX_OFFSET_KM
        if r["place"] == "village" and r["name"] in KEEP_VILLAGES:
            limit = TOWN_MAX_OFFSET_KM
        if off > limit or (r["name"] in best and best[r["name"]][0] <= off):
            continue
        best[r["name"]] = (off, r, route_line.project(pt))
    for off, r, arc in best.values():
        kk = float(np.interp(arc, tm_arc, km))
        lms.append(dict(name=r["name"], kind="town", place=r["place"], **at(kk),
                        lon=round(r["lon"], 5), lat=round(r["lat"], 5), offRouteKm=round(off, 2)))

    first_of = {}
    for i, rc in enumerate(reaches):
        first_of.setdefault(rc["attrs"]["river"], i)
    for a, b in zip(segments, segments[1:]):
        rc = reaches[first_of[b["river"]]]
        lon, lat = rc["coords"][0]
        lms.append(dict(name=f"{a['name']} – {b['name']}", kind="confluence", **at(b["startKm"]),
                        lon=round(float(lon), 5), lat=round(float(lat), 5), offRouteKm=0.0))
    for res in reservoirs:
        i = float(np.interp(res["damKm"], km, np.arange(len(km))))
        lms.append(dict(name=res["name"], kind="dam", reservoir=res["id"], **at(res["damKm"]),
                        lon=round(float(np.interp(i, np.arange(len(km)), lonlat[:, 0])), 5),
                        lat=round(float(np.interp(i, np.arange(len(km)), lonlat[:, 1])), 5),
                        offRouteKm=res["damOffRouteKm"]))
    lms.append(dict(name="Océano Atlántico", kind="sea", km=round(float(km[-1]), 3), s=round(float(s_fine[-1]), 1),
                    lon=round(float(lonlat[-1, 0]), 5), lat=round(float(lonlat[-1, 1]), 5), offRouteKm=0.0))
    lms.sort(key=lambda m: (m["km"], m["kind"]))
    return lms

def smoothing_report(source_root):
    """Print the no-fold trade-off: min bend radius (game m), route change, for several smoothing settings."""
    corridor = DEFAULTS["corridor_half_width_m"]
    print(f"corridor half-width {corridor:.0f} game m; radii are in game metres with the 1:{COMPRESSION:.0f} route axis")
    print("sigma_km  limiter  minR_m  planScale  maxDev_m  sinuosity(alu/col/lim/neg)")
    for sigma, limit in [(1, False), (2, False), (4, False), (6, False), (8, False), (10, False), (2, True), (4, True), (8, True)]:
        r = build_route(source_root, smoothing_km=sigma, min_radius_margin=1.1 if limit else 0.0)
        d = r["diagnostics"]
        sin = "/".join(f"{d['sinuosityKept'][k]:.2f}" for k, _ in RIVERS)
        print(f"{sigma:8.1f}  {str(limit):7}  {d['minBendRadiusM']:6.0f}  1:{d['planimetricScale']:<7.1f} "
              f"{d['maxLateralDeviationM']:8.0f}  {sin}  passes={d['limiterPasses']}")

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source-root", default=os.environ.get("BASIN_EXPLORER_ROOT", DEFAULT_SOURCE_ROOT))
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--smoothing-km", type=float, default=DEFAULTS["smoothing_km"], help="Gaussian sigma of the centerline smoothing (real km)")
    ap.add_argument("--corridor-m", type=float, default=DEFAULTS["corridor_half_width_m"], help="terrain corridor half-width (game m)")
    ap.add_argument("--spacing-m", type=float, default=DEFAULTS["spacing_m"], help="centerline sample spacing (game m)")
    ap.add_argument("--report", action="store_true", help="print the smoothing / no-fold table instead of writing")
    args = ap.parse_args(argv)
    if not Path(args.source_root).exists():
        sys.exit(f"source root not found: {args.source_root}")
    if args.report:
        smoothing_report(args.source_root)
        return
    route = build_route(args.source_root, smoothing_km=args.smoothing_km, corridor_half_width_m=args.corridor_m, spacing_m=args.spacing_m)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(route, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    d = route["diagnostics"]
    print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB): {len(route['reaches'])} reaches, {route['realLengthKm']} km real, "
          f"{route['gameLengthM'] / 1000:.2f} km game, min bend radius {d['minBendRadiusM']} m, plan scale 1:{d['planimetricScale']}")

if __name__ == "__main__":
    main()
