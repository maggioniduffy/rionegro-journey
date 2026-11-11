## 1. River centrelines

| Source | File | Format / CRS | Select by |
|---|---|---|---|
| HydroRIVERS v10 (SA) | `data/raw/hydrorivers/HydroRIVERS_v10_sa_shp/HydroRIVERS_v10_sa.shp` | ESRI shapefile, EPSG:4326, 1,620,963 lines, extent lat −55.88 → mouth covered | `HYRIV_ID` / `NEXT_DOWN` / `MAIN_RIV`; **no name field** |
| Derived, named | `data/out/nqn/rivers.ndjson` (24 rivers) | NDJSON, WGS84 lon/lat | `_id`: `alumine`, `collon-cura`, `limay`, `negro` |
| Derived, per reach | `data/out/nqn/reaches.ndjson` (8,016) | NDJSON | `river == "alumine"` (43), `"collon-cura"` (38), `"limay"` (160), `"negro"` (164) |
| Derived, geometry | `data/work/nqn/tiles/reaches.geojson` (7,721 lines) | GeoJSON | `properties.river`, `properties.id` |
| Names | `data/raw/ign/lineas_de_aguas_continentales_perenne/lineas_de_aguas_continentales_perenneLine.shp` | Shapefile, EPSG:4326, 50,093 lines | `nam` = `Aluminé`, `Collón Curá`, `Limay`, `Negro` (+ `Negro (Brazo Norte/Sur)`) |
| Name↔reach map | `data/work/nqn/ign-match/reach_ign.parquet` / `.ndjson` | Parquet/NDJSON | `HYRIV_ID`, `name`, `coverage`, `confidence` |

**HydroRIVERS main-stem trace.** Whole route = `MAIN_RIV = 61560077`. Walk `NEXT_DOWN` from **61546168** (Lago Aluminé outlet, −71.06/−38.96, Q 23.7 m³/s):
`61546168 → 61552346` (Aluminé mouth) `→ 61552423 … 61556572` (Collón Curá) `→ 61556606 … 61546258` (Limay) `→ 61546311 … 61560077` (Negro, `NEXT_DOWN=0`). **371 reaches, 1,292.8 km.**

**Río Negro reaches the sea in every layer** — `negro` bbox −68.015…−62.802, −38.981…−40.994; mouth lat −40.99375, lon −62.80208, elevation 0 m, `distanceToSeaKm` 0. Not clipped to Neuquén (`data/work/nqn/basin/basin.geojson` bbox −71.96…−62.75).

Caveat: the stated headwater (−39.23, −71.0) is the **town** of Aluminé (reach 61547739/61547774); the real lake outlet is −38.96,−71.06. Also `rivers.ndjson`'s `limay` (461.6 km) starts at Lago Nahuel Huapi and therefore includes the branch past Alicurá, which is *not* on the Aluminé→Collón Curá→sea route.

## 2. DEM

| File | Type | Resolution | CRS | WGS84 bbox |
|---|---|---|---|---|
| `data/raw/alos/AP_27847_PLR_F6470_RT1.dem.tif` | GTiff Int16, 3934×5756, 490–3981 m, NoData 0 | 12.5 m | EPSG:32719 (UTM 19S) | −71.125…−70.567, −35.966…−35.310 |
| same stem `_HH/_HV/_VH/_VV`, `.inc_map`, `.ls_map` | SAR/aux rasters | 12.5 m | EPSG:32719 | identical footprint |

**Corridor coverage (lon −71.3…−62.7, lat −41.2…−38.8): 0.0 %, 0 of 20.6 deg².** The tile's southern edge is 2.8° north of the corridor. `data/work/nqn/flow-water/out/*.water.tif` are 10 m Sentinel-2 water masks, not DEMs. No other DEM exists under `data/`, `public/` or `regions/`.

## 3. Lakes / reservoirs

| Body | HydroLAKES `Hylak_id` (`Lake_name`) | km² | IGN name (`work/nqn/tiles/ign_lakes.geojson`) | Dam coord (`ign_dam_walls.geojson`) |
|---|---|---|---|---|
| Alicurá | 10590 (`Alicura`) | 53.4 | Embalse Alicurá | −70.753, −40.586 |
| Piedra del Águila | 986 (`NULL`) | 230.8 | Embalse Piedra del Águila | −69.997, −40.190 |
| Pichi Picún Leufú | 10580 (`NULL`) | 16.8 | Embalse Pichi Picún Leufú | −69.984, −40.013 |
| El Chocón | 981 (`Chocon Reservoir`) | 711.5 | Embalse Ezequiel Ramos Mexía | −68.754, −39.275 |
| Arroyito | 10571 (`Arroyito`) | 36.1 | Embalse Arroyito | −68.585, −39.108 |

Sources: `data/raw/hydrolakes/.../HydroLAKES_polys_v10.shp` (`Hylak_id`, `Lake_name`, `Lake_type=2`, `Grand_id` 2342–2346), `data/work/nqn/lakes/lakes.parquet` + `lakes.geojson` (`id`,`name`,`type`), `tiles/ign_lakes.geojson` (`id`,`name`,`nameSource`,`kind`). Note **Alicurá sits upstream of the Collón Curá junction** (d2sea 1078 vs 1056 km), so it is off the strict route.

## 4. Per-reach attributes

| Attribute | Field | Where |
|---|---|---|
| Discharge | `DIS_AV_CMS` → `dischargeM3s`; `dis_m3_pyr/pmn/pmx` | reaches.ndjson; `work/nqn/rivers/riveratlas_basin.parquet` |
| Width | *not exported*; derive `ria_ha_csu*10000/(LENGTH_KM*1000)` (`pipeline/lib/flow-sections.ts:744`) or read `channel.widthM {min,p50,max}` | `public/flow/nqn/<river>-NNN.json` (132 sections) |
| Stream order | `ORD_STRA` → `strahler` | reaches.ndjson |
| Elevation | `ele_mt_cmn/cav/cmx` → `catchmentMinElevationM`; source/mouth m | reaches.ndjson; `rivers.ndjson` |
| Slope | `sgr_dk_rav` (dm/km) → `gradientMPerKm`; `slp_dg_cav` | reaches.ndjson; parquet |
| Extras | `uplandKm2`, `distanceToSeaKm`, `regulationPct`, `nonPerennial*`, `upstreamPopulation`, `upstreamLakesPct` | reaches.ndjson |

Cross-sections for a game: `public/flow/nqn/*.json` (`stations`, `lengthM`, `flowable`) and `data/work/nqn/flow-sections/courses.json`.

## 5. Localities / landmarks

| File | Contents |
|---|---|
| `data/work/nqn/localities/nodes.ndjson` | 249 OSM nodes, fields `id,name,place,lon,lat` — Aluminé (−70.9159,−39.2385), Junín de los Andes, Piedra del Águila (−70.0752,−40.0486), Picún Leufú, Neuquén, Cipolletti, General Roca, Villa Regina, Choele Choel, **Viedma (−62.9947,−40.8084)**, **El Cóndor (−62.8277,−41.0415)** |
| `data/work/nqn/tiles/localities.geojson` | 116 in-basin features (`id,name,place` + point) |
| `data/work/nqn/tiles/ign_dams.geojson` / `ign_dam_walls.geojson` | 9 / 24 named dam landmarks with coordinates |

## 6. Gaps

- **DEM — the only true blocker.** Download Copernicus DEM GLO-30 from AWS Open Data `copernicus-dem-30m` (free, open; registry `https://registry.opendata.aws/copernicus-dem/`), ~40 1°×1° COGs covering 38–42°S / 62–72°W. Nothing else supplies terrain for the corridor.
- **RiverATLAS v10 GDB and GIRES v10 GDB are missing** (`data/raw/riveratlas/` has only `*.pdf` + `*Legends.xlsx`; `data/raw/gires/` is empty), yet cached 8,016-row subsets exist at `data/work/nqn/rivers/riveratlas_basin.parquet` and `gires_basin.parquet`. Re-download from hydroatlas/GIRES only if attributes must be re-derived.
- **No download needed:** HydroRIVERS v10 SA, HydroLAKES v10, HydroBASINS lev01–12, IGN national water lines and OSM localities are present and cover the mouth.
- **Do not use the `*_CPA.zip` files** — `CursosDeAgua_CPA` (4,241 lines), `Embalses_CPA` (27) and the Cuencas/Subcuencas zips are **Córdoba-only** (extent −65.60…−61.82, −35.00…−29.51).
