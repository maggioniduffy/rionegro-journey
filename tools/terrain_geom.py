"""Shared geometry for the terrain strip: station frame along the route, sample positions, DEM tile selection.

Conventions
- Stations sit every `resolution_m` game metres along the route (s = i * resolution_m).
- The base point of a station is the TRUE river point (route.json lon/lat interpolated at s).
- The cross direction comes from the SMOOTHED real line (Gaussian, `cross_smooth_km` real km), because the raw
  HydroRIVERS line is jaggy and would make the strip fold and shear. d > 0 is to the LEFT of the flow direction.
- A strip sample (station i, offset d game m) is the base point moved along the cross direction by
  d * lateral_scale real metres, in the route's transverse-Mercator plane.
"""
import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from pyproj import Transformer

import route_geom

ROOT = Path(__file__).resolve().parent.parent
ROUTE_FILE = ROOT / "public" / "data" / "route.json"
DEM_DIR = ROOT / "data" / "raw" / "copernicus"

DEFAULTS = dict(
    lateral_scale=8.0,  # real metres per game metre across the valley
    vertical_scale=8.0,  # real metres per game metre in height
    resolution_m=2.0,  # game metres between stations and between columns
    half_width_m=300.0,  # game metres each side of the river
    cross_smooth_km=3.0,  # real km Gaussian sigma for the cross-direction line
)


def load_route(path=ROUTE_FILE):
    return json.loads(Path(path).read_text())


@dataclass
class Frame:
    s: np.ndarray  # game distance of each station
    px: np.ndarray  # true river point, plane metres
    py: np.ndarray
    cross: np.ndarray  # (n, 2) unit vector, left of the flow, from the smoothed line
    km: np.ndarray  # real km along the route
    km_total: float
    to_lonlat: Transformer

    @property
    def n(self):
        return len(self.s)


def build_frame(route, resolution_m=DEFAULTS["resolution_m"], cross_smooth_km=DEFAULTS["cross_smooth_km"]):
    c = route["centerline"]
    crs = route["params"]["crs"]
    fwd = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    inv = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    X, Y = fwd.transform(np.asarray(c["lon"]), np.asarray(c["lat"]))
    s_c = np.arange(c["n"]) * c["spacingM"]
    total = float(route["gameLengthM"])
    n = int(math.floor(total / resolution_m + 1e-9)) + 1
    s = np.arange(n) * resolution_m
    px, py = np.interp(s, s_c, X), np.interp(s, s_c, Y)
    km = np.interp(s, s_c, np.asarray(c["km"]))
    xy = np.c_[px, py]
    step = float(np.mean(np.hypot(*np.diff(xy, axis=0).T)))
    smooth = route_geom.gaussian_smooth(xy, cross_smooth_km * 1000.0, step)
    t = np.c_[np.gradient(smooth[:, 0]), np.gradient(smooth[:, 1])]
    t /= np.maximum(np.hypot(t[:, 0], t[:, 1]), 1e-12)[:, None]
    cross = np.c_[-t[:, 1], t[:, 0]]
    return Frame(s, px, py, cross, km, float(route["realLengthKm"]), inv)


def offsets(half_width_m, resolution_m):
    """Column offsets d (game m), from -half to +half inclusive."""
    k = int(round(half_width_m / resolution_m))
    return np.arange(-k, k + 1) * resolution_m


def sample_lonlat(frame, rows, d, lateral_scale):
    """lon/lat of the strip samples for station slice `rows` and offsets `d`; shape (rows, len(d))."""
    off = np.asarray(d, dtype=float)[None, :] * lateral_scale
    X = frame.px[rows][:, None] + frame.cross[rows, 0][:, None] * off
    Y = frame.py[rows][:, None] + frame.cross[rows, 1][:, None] * off
    return frame.to_lonlat.transform(X, Y)


def tile_name(lat0, lon0):
    """Copernicus GLO-30 COG name for the 1x1 degree tile whose SOUTH-WEST corner is (lat0, lon0)."""
    ns, ew = ("N" if lat0 >= 0 else "S"), ("E" if lon0 >= 0 else "W")
    return f"Copernicus_DSM_COG_10_{ns}{abs(lat0):02d}_00_{ew}{abs(lon0):03d}_00_DEM"


def corridor_tiles(frame, lateral_scale, half_width_m, pad_deg=0.002, probes=9):
    """Sorted list of (lat0, lon0) 1x1 degree tiles touched by the route plus its lateral margin."""
    d = np.linspace(-half_width_m, half_width_m, probes)
    found = set()
    for lo in range(0, frame.n, 4096):
        rows = slice(lo, min(lo + 4096, frame.n))
        lon, lat = sample_lonlat(frame, rows, d, lateral_scale)
        for dx in (-pad_deg, 0.0, pad_deg):
            for dy in (-pad_deg, 0.0, pad_deg):
                ij = np.unique(np.c_[np.floor(lat + dy).ravel(), np.floor(lon + dx).ravel()], axis=0)
                found.update((int(a), int(b)) for a, b in ij)
    return sorted(found)
