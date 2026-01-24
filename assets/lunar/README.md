# Lunar Map Data

These color and elevation maps are designed for use in 3D rendering software. They are created from data assembled by the Lunar Reconnaissance Orbiter camera and laser altimeter instrument teams.

## Files

- `lroc_color_16bit_srgb_4k.tif` - Color map (4096x2048, 16-bit sRGB)
- `ldem_16.tif` - Displacement/elevation map (5760x2880, 16 pixels per degree)

## Color Map

The color maps were adapted from the Hapke Normalized WAC Mosaic, a composite built by the camera team from over 100,000 WAC (Wide Angle Camera) images. The readme file provides a technical summary of how the mosaic was constructed along with references to more detailed publications. A less formal introduction to the process is in this LROC blog post and in this one.

Both color maps were assembled from three of the seven wavelength bands of the LROC color data, with the 643 nm band representing the red channel, 566 nm the green, and 415 nm the blue. Exposure and white balance were adjusted to more closely match human vision, and small data dropouts at high latitudes were inpainted.

The source data covers the lunar globe from 70°N to 70°S. Because the Moon's axial and orbital tilts are both small, many areas outside these latitudes remain shrouded in shadow, even after thousands of passes by LRO's camera, so they are left out of the LROC mosaic. For these color maps, the missing latitudes were filled in with a lower resolution monochromatic albedo map (LDAM) from LRO's laser altimeter, which measures the brightness of the reflected laser. When rendered with realistic shadows, these parts of the map aren't particularly visible, and while they comprise more than 20% of the map's pixels, they represent only 6% of the Moon's surface.

## Displacement Map

The displacement map (also known as a height map or elevation map) was taken directly from the latest (as of spring 2019) gridded data products of the Lunar Orbiter Laser Altimeter instrument team. LOLA data is archived on the Geosciences Node of the Planetary Data System. A small subset of the LOLA data stored there, the global cylindrical projections at 4, 16, and 64 pixels per degree, has been reformatted here as uncompressed TIFF files, in vertical units of either floating-point kilometers or 16-bit unsigned integer half-meters.

The reference surface for all LRO data is a sphere of radius 1737.4 km. LOLA's gridded elevation data is published as signed 16-bit integers in units of half-meters relative to this radius. For the floating-point TIFFs, the source data was divided by 2000. For the unsigned 16-bit TIFFs, the source data was offset by +20,000 (10 km) so that all of the values are positive. This latter format is provided for software that doesn't work well with either floating-point or signed integer files.

## Download

Run the download script to fetch the assets:

```bash
./download.sh
```

Or use the project-wide asset download:

```bash
npm run download-assets
```

## Attribution

**Source:** [NASA Scientific Visualization Studio - CGI Moon Kit](https://svs.gsfc.nasa.gov/4720)

**License:** NASA media is generally not copyrighted (see [NASA Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/))

**Credit:** NASA's Scientific Visualization Studio

**Visualizer:** Ernie Wright (USRA)

**Scientist:** Noah Petro (NASA/GSFC)

**Datasets:**
- DEM (Digital Elevation Map) [LRO: LOLA]
- LROC WAC Color Mosaic (Natural Color Hapke Normalized WAC Mosaic) [Lunar Reconnaissance Orbiter: LRO Camera]
