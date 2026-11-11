"""Smoke test: the geospatial toolchain imports and pyogrio can filter with `where=`."""
import json

import numpy as np
import pyogrio
import pyproj
import rasterio
import shapely


def test_versions_present():
    for mod in (np, pyogrio, pyproj, rasterio, shapely):
        assert mod.__version__


def test_pyogrio_where_filter(tmp_path):
    path = tmp_path / "reaches.geojson"
    features = [
        {
            "type": "Feature",
            "properties": {"MAIN_RIV": main},
            "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]},
        }
        for main in (61560077, 61560077, 1)
    ]
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    _meta, _fids, _geom, fields = pyogrio.raw.read(path, where="MAIN_RIV = 61560077")
    assert len(fields[0]) == 2
