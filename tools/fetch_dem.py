"""Download the Copernicus GLO-30 DEM tiles touched by the route corridor (resumable, one tile at a time).

Tiles are 1x1 degree Cloud Optimized GeoTIFFs from the public AWS bucket `copernicus-dem-30m`, fetched over
anonymous HTTPS into data/raw/copernicus/ (git-ignored). Tiles that do not exist in the bucket (all-sea tiles)
are recorded in data/raw/copernicus/missing.json and treated as sea level by build_terrain.py.

  .venv/bin/python tools/fetch_dem.py --dry-run          # list tiles (and sizes with --sizes), download nothing
  .venv/bin/python tools/fetch_dem.py                    # download what is missing
"""
import argparse
import json
import sys
import urllib.error
import urllib.request

import terrain_geom as tg

BUCKET = "https://copernicus-dem-30m.s3.amazonaws.com"
MISSING = "missing.json"


def tile_url(lat0, lon0):
    name = tg.tile_name(lat0, lon0)
    return f"{BUCKET}/{name}/{name}.tif"


def remote_size(url):
    """Content-Length from a HEAD request; None when the object does not exist (404/403)."""
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=60) as r:
            return int(r.headers["Content-Length"])
    except urllib.error.HTTPError as e:
        if e.code in (403, 404):
            return None
        raise


def download(url, dest, expected):
    """Download `url` to `dest` via dest.part, resuming a partial file; verifies the final size."""
    part = dest.with_name(dest.name + ".part")
    have = part.stat().st_size if part.exists() else 0
    if have > expected:
        part.unlink()
        have = 0
    if have < expected:
        req = urllib.request.Request(url, headers={"Range": f"bytes={have}-"} if have else {})
        with urllib.request.urlopen(req, timeout=120) as r, open(part, "ab" if have and r.status == 206 else "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
    if part.stat().st_size != expected:
        raise IOError(f"{dest.name}: got {part.stat().st_size} bytes, expected {expected}")
    part.rename(dest)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="only list the tiles the corridor touches")
    ap.add_argument("--sizes", action="store_true", help="with --dry-run, also HEAD each tile for its size")
    ap.add_argument("--lateral-scale", type=float, default=tg.DEFAULTS["lateral_scale"])
    ap.add_argument("--half-width", type=float, default=tg.DEFAULTS["half_width_m"], help="game m each side")
    ap.add_argument("--out-dir", default=str(tg.DEM_DIR))
    args = ap.parse_args(argv)

    route = tg.load_route()
    frame = tg.build_frame(route)
    tiles = tg.corridor_tiles(frame, args.lateral_scale, args.half_width)
    out = tg.Path(args.out_dir)
    print(f"{len(tiles)} tiles touched by the corridor (route +/- {args.half_width * args.lateral_scale:.0f} real m)")
    if args.dry_run:
        total = 0
        for lat0, lon0 in tiles:
            size = remote_size(tile_url(lat0, lon0)) if args.sizes else None
            total += size or 0
            print(f"  {tg.tile_name(lat0, lon0)}" + (f"  {size / 1e6:.1f} MB" if size else ("  (not in bucket)" if args.sizes else "")))
        if args.sizes:
            print(f"estimated total {total / 1e6:.0f} MB")
        return 0

    out.mkdir(parents=True, exist_ok=True)
    mf = out / MISSING
    missing = set(json.loads(mf.read_text())) if mf.exists() else set()
    got = total = 0
    for lat0, lon0 in tiles:
        name = tg.tile_name(lat0, lon0)
        dest = out / f"{name}.tif"
        if dest.exists():
            got += 1
            total += dest.stat().st_size
            print(f"  have    {name}")
            continue
        if name in missing:
            print(f"  missing {name} (recorded, treated as sea level)")
            continue
        url = tile_url(lat0, lon0)
        size = remote_size(url)
        if size is None:
            missing.add(name)
            mf.write_text(json.dumps(sorted(missing), indent=1))
            print(f"  missing {name} (not in bucket, treated as sea level)")
            continue
        print(f"  fetch   {name} {size / 1e6:.1f} MB", flush=True)
        download(url, dest, size)
        got += 1
        total += size
    print(f"{got} tiles on disk, {total / 1e6:.0f} MB; {len(missing)} missing (sea)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
