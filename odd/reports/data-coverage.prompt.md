READ-ONLY task. Do not create, edit or delete any file in this repository; do not run pipelines, installs or network downloads.

Goal: report whether the data in ./data can supply a 3D river game route following Rio Alumine -> Rio Collon Cura -> Rio Limay -> Rio Negro -> Atlantic Ocean (mouth near Viedma / El Condor).

Scope: ./data/raw (alos, hydrorivers, hydrolakes, riveratlas, gires, ign, the *_CPA.zip files), ./data/work/nqn, ./data/out/nqn, and ./pipeline only to understand formats. Use ogrinfo/gdalinfo/python/head for inspection; never print whole files.

Answer exactly these, each with path evidence:

1. River centerlines: which file(s) contain each of the four rivers, format, CRS, the name/id fields and the ids or filter needed to select each river, and whether the Rio Negro is covered down to the sea or only inside Neuquen province. For HydroRIVERS give the HYRIV_ID/MAIN_RIV/NEXT_DOWN approach to trace the main stem from the Alumine headwater (Lago Alumine outlet, approx -39.23,-71.0) to the mouth (approx -41.03,-62.79).
2. DEM: bounding box, resolution and CRS of every DEM raster in data/raw/alos and anywhere else; state what fraction of the route corridor (lon -71.3..-62.7, lat -41.2..-38.8) it covers.
3. Lakes and reservoirs on the route (Alicura, Piedra del Aguila, Pichi Picun Leufu, El Chocon, Arroyito): file, id, name field.
4. Per-reach attributes available: discharge, width, stream order, elevation, slope, and field names.
5. Localities/landmarks files with name and coordinates.
6. Gaps: what must be downloaded from outside and from which public source (e.g. Copernicus GLO-30, HydroRIVERS).

Output format: markdown, under 900 words, sections numbered 1-6, tables where useful, exact relative paths.
