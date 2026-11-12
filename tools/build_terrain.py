"""Build the terrain strip in route space: public/data/terrain/{manifest.json, strip-NNN.bin}.

Rows are stations along the route every `--resolution` game metres, columns are lateral offsets d in
[-half-width, +half-width] game metres (d > 0 = left of the flow). Each sample reads the Copernicus GLO-30 DEM at
the station's TRUE river point moved along the cross direction of the smoothed real line by d * lateral-scale real
metres (see terrain_geom.py). Height in game units = (DEM elevation - reference) / vertical-scale.

Water surface per station (game units, same scale as the heights):
  1. raw level = lowest DEM value within +/- snap-m real metres of the river point;
  2. per free-river run (between reservoirs): rolling median, running minimum downstream, box smoothing
     (all three keep the series non-increasing);
  3. reservoirs are one flat level from their start to their dam station (the lower of the incoming level and the
     reservoir's median DEM), and the next run starts below it: that is the dam step the portage uses;
  4. over the last 60 real km the level is capped by a gentle slope (0.2 m/km) down to exactly 0 at the sea.
The channel is then carved: a parabolic bed under the water across the game channel width, a smoothstep bank of
`--bank-m` game metres up to the DEM, and the land never lower than water + `--freeboard`.

Terrain is cut into chunks of `--chunk-stations` rows of raw little-endian uint16:
  height = encoding.heightMin + value * encoding.heightStep   (game metres)
"""
import argparse
import json
import sys
import time
import zlib
from pathlib import Path

import numpy as np
import rasterio
from numpy.lib.stride_tricks import sliding_window_view

import terrain_geom as tg

OUT_DIR = tg.ROOT / "public" / "data" / "terrain"
REPORT_PNG = tg.ROOT / "odd" / "reports" / "terrain-strip.png"
BLOCK = 256  # stations sampled per DEM pass


def parse_args(argv=None):
    d = tg.DEFAULTS
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lateral-scale", type=float, default=d["lateral_scale"], help="real m per game m across the valley")
    ap.add_argument("--vertical-scale", type=float, default=d["vertical_scale"], help="real m per game m of height")
    ap.add_argument("--resolution", type=float, default=d["resolution_m"], help="game m between stations and columns")
    ap.add_argument("--half-width", type=float, default=d["half_width_m"], help="game m each side of the river")
    ap.add_argument("--cross-smooth-km", type=float, default=d["cross_smooth_km"], help="real km sigma of the cross-direction line")
    ap.add_argument("--reference-m", type=float, default=0.0, help="real elevation mapped to game height 0 (sea level)")
    ap.add_argument("--snap-m", type=float, default=250.0, help="real m around the river point searched for the channel bottom")
    ap.add_argument("--water-smooth-km", type=float, default=4.0, help="real km window of the water-level median filter")
    ap.add_argument("--depth", type=float, default=1.0, help="channel depth below the water, game m")
    ap.add_argument("--bank-m", type=float, default=10.0, help="width of the smooth bank beside the channel, game m")
    ap.add_argument("--lake-shore-slope", type=float, default=0.06, help="shore rise per game m beside reservoirs")
    ap.add_argument("--freeboard", type=float, default=0.3, help="minimum land height above the water, game m")
    ap.add_argument("--chunk-stations", type=int, default=1024)
    ap.add_argument("--dem-dir", default=str(tg.DEM_DIR))
    ap.add_argument("--out-dir", default=str(OUT_DIR))
    ap.add_argument("--png", default=str(REPORT_PNG), help="quick-look PNG path ('' to skip)")
    return ap.parse_args(argv)


class DemReader:
    """Bilinear DEM lookups over 1x1 degree tiles, windowed reads, one tile at a time. Missing tile = sea level 0."""

    def __init__(self, directory):
        self.dir = Path(directory)
        self.used = set()

    def sample(self, lon, lat):
        out = np.zeros(lon.shape, dtype=np.float32)
        tile = np.floor(lat).astype(int) * 1000 + np.floor(lon).astype(int)
        for key in np.unique(tile):
            lat0, lon0 = divmod(int(key) + 500, 1000)  # key = lat * 1000 + lon, lon in [-500, 500)
            lon0 -= 500
            name = tg.tile_name(lat0, lon0)
            path = self.dir / f"{name}.tif"
            if not path.exists():
                continue  # all-sea tile absent from the bucket: stays 0
            self.used.add(name)
            m = tile == key
            with rasterio.open(path) as ds:
                inv = ~ds.transform
                col, row = inv * (lon[m], lat[m])
                col, row = col - 0.5, row - 0.5  # pixel centres
                r0 = max(int(np.floor(row.min())), 0)
                r1 = min(int(np.floor(row.max())) + 2, ds.height)
                c0 = max(int(np.floor(col.min())), 0)
                c1 = min(int(np.floor(col.max())) + 2, ds.width)
                win = ds.read(1, window=((r0, r1), (c0, c1))).astype(np.float32)
                if ds.nodata is not None:
                    win[win == ds.nodata] = np.nan
            fr, fc = row - r0, col - c0
            i0 = np.clip(np.floor(fr).astype(int), 0, win.shape[0] - 1)
            j0 = np.clip(np.floor(fc).astype(int), 0, win.shape[1] - 1)
            i1, j1 = np.minimum(i0 + 1, win.shape[0] - 1), np.minimum(j0 + 1, win.shape[1] - 1)
            ty, tx = np.clip(fr - i0, 0, 1), np.clip(fc - j0, 0, 1)
            top = win[i0, j0] * (1 - tx) + win[i0, j1] * tx
            bot = win[i1, j0] * (1 - tx) + win[i1, j1] * tx
            out[m] = top * (1 - ty) + bot * ty
        return out


def fill_holes(h):
    """Replace NaN (DEM nodata) by the nearest valid value along the row, then along the column; rest -> 0."""
    if not np.isnan(h).any():
        return h
    for axis in (1, 0):
        a = h if axis == 1 else h.T
        n = a.shape[1]
        idx = np.where(np.isnan(a), -1, np.arange(n)[None, :])
        np.maximum.accumulate(idx, axis=1, out=idx)  # nearest valid to the left
        ridx = np.where(np.isnan(a), n, np.arange(n)[None, :])
        ridx = np.minimum.accumulate(ridx[:, ::-1], axis=1)[:, ::-1]  # nearest valid to the right
        pos = np.arange(n)[None, :]
        left_ok, right_ok = idx >= 0, ridx < n
        pick = np.where(left_ok & (~right_ok | (pos - idx <= ridx - pos)), idx, ridx)
        valid = left_ok | right_ok
        filled = np.take_along_axis(a, np.clip(pick, 0, n - 1), axis=1)
        a[:] = np.where(np.isnan(a) & valid, filled, a)
    return np.nan_to_num(h, nan=0.0)


def rolling_median(x, window):
    if len(x) < 3:
        return x.copy()
    w = min(window | 1, (len(x) // 2) * 2 - 1) if len(x) > 2 else 1
    w = max(w, 1)
    pad = np.pad(x, w // 2, mode="edge")
    return np.median(sliding_window_view(pad, w), axis=1)


def box_smooth(x, window):
    w = max(int(window) | 1, 1)
    pad = np.pad(x, w // 2, mode="edge")
    return np.convolve(pad, np.ones(w) / w, mode="valid")


def water_surface(raw, reservoirs, mouth_dist_m, median_win, smooth_win, mouth_slope=2e-4, mouth_span_m=60e3):
    """Water level per station in the same unit as `raw` (real metres here).

    `reservoirs` is a list of (i0, i1) station index pairs (start .. dam station, inclusive). The result is
    non-increasing, flat on each reservoir, steps down after its dam and is 0 at the last station.
    """
    n = len(raw)
    out = np.empty(n)
    level = np.inf
    pos = 0
    for i0, i1 in list(reservoirs) + [(n, n)]:
        if i0 > pos:  # free-river run [pos, i0)
            run = rolling_median(raw[pos:i0], median_win)
            run = np.minimum.accumulate(np.minimum(run, level))
            run = box_smooth(run, smooth_win)
            out[pos:i0] = run
            level = run[-1]
        if i1 >= i0 and i0 < n:  # reservoir [i0, i1]
            level = min(level, float(np.median(raw[i0 : i1 + 1])))
            out[i0 : i1 + 1] = level
        pos = max(pos, i1 + 1)
    near = mouth_dist_m < mouth_span_m
    out = np.where(near, np.minimum(out, np.maximum(mouth_dist_m, 0.0) * mouth_slope), out)
    out = np.minimum.accumulate(np.maximum(out, 0.0))
    out[-1] = 0.0
    return out


def carve(h, water, half_ch, d_abs, depth, bank, freeboard, shore_slope=None):
    """Carve the channel into heights `h` (stations x columns), in place. All lengths in game units.

    `shore_slope` (per station, height per metre) lifts the land away from the channel on reservoir stations, where the
    DEM is the real lake surface much wider than the game lake, so the shore rises instead of staying a flat shelf.
    """
    w = water[:, None]
    u = d_abs[None, :] / half_ch[:, None]
    t = np.clip((d_abs[None, :] - half_ch[:, None]) / bank, 0.0, 1.0)
    smooth = t * t * (3 - 2 * t)
    land = np.maximum(h, w + freeboard)
    if shore_slope is not None:
        rise = shore_slope[:, None] * np.maximum(d_abs[None, :] - half_ch[:, None] - bank, 0.0)
        land = np.maximum(land, w + freeboard + rise)
    banked = w + (land - w) * smooth
    bed = w - depth * (1.0 - np.minimum(u, 1.0) ** 2)
    h[:] = np.where(u < 1.0, bed, banked)


def write_png(path, rgb):
    h, w, _ = rgb.shape
    raw = b"".join(b"\x00" + rgb[y].tobytes() for y in range(h))

    def chunk(tag, data):
        c = zlib.crc32(tag + data) & 0xFFFFFFFF
        return len(data).to_bytes(4, "big") + tag + data + c.to_bytes(4, "big")

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", w.to_bytes(4, "big") + h.to_bytes(4, "big") + bytes([8, 2, 0, 0, 0]))
    png += chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_bytes(png)


def quick_look(path, strip, water, along=2, bands=8, gap=6):
    """Hillshaded, height-tinted strip; flow runs left to right, wrapped into `bands` rows, left bank (d>0) on top."""
    sub = strip[::along].T[::-1]  # (columns, stations/along), d>0 first
    wl = water[::along]
    gy, gx = np.gradient(sub)
    shade = np.clip(0.6 + 0.9 * (gx - gy) / 2.0, 0.25, 1.15)
    hmax = max(float(strip.max()), 1.0)
    k = np.clip(sub / hmax, 0, 1)[..., None]
    low, mid, high = np.array([96, 140, 78]), np.array([176, 150, 100]), np.array([240, 240, 245])
    col = np.where(k < 0.4, low + (mid - low) * (k / 0.4), mid + (high - mid) * ((k - 0.4) / 0.6))
    rgb = np.clip(col * shade[..., None], 0, 255)
    rgb[sub < wl[None, :] + 0.05] = (40, 110, 190)
    cols, width = sub.shape
    per = -(-width // bands)
    img = np.full((bands * (cols + gap), per, 3), 255, dtype=np.uint8)
    for b in range(bands):
        seg = rgb[:, b * per : (b + 1) * per]
        img[b * (cols + gap) : b * (cols + gap) + cols, : seg.shape[1]] = seg.astype(np.uint8)
    write_png(path, img)
    return img.shape


def build(args):
    t0 = time.time()
    route = tg.load_route()
    frame = tg.build_frame(route, args.resolution, args.cross_smooth_km)
    d = tg.offsets(args.half_width, args.resolution)
    n, cols = frame.n, len(d)
    centre = cols // 2
    dem = np.empty((n, cols), dtype=np.float32)
    reader = DemReader(args.dem_dir)
    for lo in range(0, n, BLOCK):
        rows = slice(lo, min(lo + BLOCK, n))
        lon, lat = tg.sample_lonlat(frame, rows, d, args.lateral_scale)
        dem[rows] = reader.sample(lon, lat)
        if (lo // BLOCK) % 16 == 0:
            print(f"  sampled {rows.stop}/{n} stations ({time.time() - t0:.0f}s)", flush=True)
    holes = int(np.isnan(dem).sum())
    dem = fill_holes(dem)

    # Water surface (real metres first, then game units).
    snap = max(1, int(args.snap_m / args.lateral_scale / args.resolution))
    raw = dem[:, centre - snap : centre + snap + 1].min(axis=1).astype(np.float64)
    real_per_station = frame.km_total * 1000.0 / (n - 1)
    mdist = (frame.km_total - frame.km) * 1000.0
    res_idx = [(int(round(r["startS"] / args.resolution)), int(round(r["damS"] / args.resolution))) for r in route["reservoirs"]]
    wl_m = water_surface(raw, res_idx, mdist, int(args.water_smooth_km * 1000 / real_per_station), int(args.water_smooth_km * 500 / real_per_station))
    water = np.round((wl_m - args.reference_m) / args.vertical_scale, 3)

    h = (dem - args.reference_m) / args.vertical_scale
    c = route["centerline"]
    width = np.interp(frame.s, np.arange(c["n"]) * c["spacingM"], c["widthM"])
    half_ch = width / 2.0
    if (half_ch + args.bank_m >= args.half_width).any():
        raise SystemExit("channel plus bank is wider than the strip: raise --half-width or lower --bank-m")
    shore = np.zeros(n, dtype=np.float32)
    for i0, i1 in res_idx:
        shore[i0 : i1 + 1] = args.lake_shore_slope
    shore = box_smooth(shore, 41).astype(np.float32)  # ease the shore in and out at the reservoir ends
    carve(h, water.astype(np.float32), half_ch.astype(np.float32), np.abs(d).astype(np.float32), args.depth, args.bank_m, args.freeboard, shore)
    del dem

    hmin, hmax = float(h.min()), float(h.max())
    step = (hmax - hmin) / 65535.0
    q = np.rint((h - hmin) / step).astype(np.uint16)
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("strip-*.bin"):
        old.unlink()
    chunks = []
    for k, lo in enumerate(range(0, n, args.chunk_stations)):
        part = np.ascontiguousarray(q[lo : lo + args.chunk_stations], dtype="<u2")
        name = f"strip-{k:03d}.bin"
        part.tofile(out / name)
        chunks.append({"file": name, "start": lo, "count": int(part.shape[0])})

    manifest = {
        "version": 1,
        "generator": "tools/build_terrain.py",
        "source": "Copernicus GLO-30 DEM (EGM2008 heights), sampled in route space",
        "tiles": sorted(reader.used),
        "units": "game metres",
        "stations": n,
        "columns": cols,
        "resolutionM": args.resolution,
        "halfWidthM": args.half_width,
        "chunkStations": args.chunk_stations,
        "layout": "chunk file = count rows x columns raw little-endian uint16, station-major; row i is s = (start+i)*resolutionM, column j is d = -halfWidthM + j*resolutionM, d > 0 is LEFT of the flow",
        "chunks": chunks,
        "encoding": {"type": "uint16-le", "heightMin": hmin, "heightStep": step, "formula": "height = heightMin + value * heightStep"},
        "minHeight": hmin,
        "maxHeight": hmax,
        "params": {
            "lateralScale": args.lateral_scale,
            "verticalScale": args.vertical_scale,
            "referenceM": args.reference_m,
            "crossSmoothKm": args.cross_smooth_km,
            "snapM": args.snap_m,
            "waterSmoothKm": args.water_smooth_km,
            "channelDepth": args.depth,
            "bankM": args.bank_m,
            "freeboard": args.freeboard,
            "lakeShoreSlope": args.lake_shore_slope,
            "chunkStations": args.chunk_stations,
        },
        "water": {
            "unit": "game metres, same scale as heights",
            "perStation": 1,
            "decimals": 3,
            "levels": [float(x) for x in water],
        },
        "diagnostics": {"nodataFilled": holes, "reservoirStationRanges": res_idx},
    }
    (out / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")))
    size = sum(f.stat().st_size for f in out.iterdir())
    print(f"strip {n} x {cols}, height {hmin:.2f}..{hmax:.2f} game m, nodata filled {holes}, {size / 1e6:.2f} MB in {out} ({time.time() - t0:.0f}s)")
    if args.png:
        print("quick-look", args.png, quick_look(args.png, h, water))
    return manifest


def main(argv=None):
    build(parse_args(argv))
    return 0


if __name__ == "__main__":
    sys.exit(main())
