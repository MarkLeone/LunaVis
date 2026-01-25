# LunaVis

A high-fidelity WebGPU lunar visualization built from scratch in TypeScript. Designed for seamless zoom from orbit to surface using [CDLOD](https://github.com/fstrugar/CDLOD) (Continuous Distance-Dependent Level of Detail) terrain rendering, [NASA LROC](https://www.lroc.asu.edu/) imagery, physically-based [Hapke](https://en.wikipedia.org/wiki/Hapke_parameters) lighting for realistic lunar regolith, and solar system [ephemeris](https://en.wikipedia.org/wiki/Ephemeris) calculations for accurate Sun/Moon positioning.

**Status:** Milestone 9 complete — CDLOD foundation (quadtree + LOD selection). Next: Debug visualization and GPU rendering.

## Quick Start

```bash
npm install
npm run download-assets  # Fetch lunar textures (~120 MB)
npm run dev
```

Then open http://localhost:3000

## Browser and OS Support for WebGPU

| Browser | Windows | macOS | Linux | Notes |
|--------|---------|-------|-------|------|
| Chrome | ✅ | ✅ | ✅ | DX12 (Win), Metal (macOS), Vulkan (Linux) |
| Edge | ✅ | ✅ | ✅ | Same WebGPU stack as Chrome |
| Firefox | ✅ | ✅ | 🚧 | On Linux, enable `about:config -> dom.webgpu.enabled` |
| Safari | ❌ | ✅ | ❌ | macOS only (Metal backend) |

> - ✅ **Supported** — enabled by default, no flags required  
> - ⚠️ **Partial** — supported with platform or backend limitations  
> - 🚧 **Experimental** — behind flags or incomplete  
> - ❌ **Not supported**



## Features

### Current (Milestone 7)
- **Textured Moon** — [NASA LROC](https://www.lroc.asu.edu/) (Lunar Reconnaissance Orbiter Camera) color map with [KTX2](https://www.khronos.org/ktx/) compression and mipmaps
- **glTF model loading** — Load standard 3D models (.glb/.gltf) via [@loaders.gl](https://loaders.gl/)
- **Blinn-Phong lighting** — Classic ambient + diffuse shading (specular disabled for accurate lunar dust appearance)
- **Orbit controls** — Click-drag to rotate, scroll to zoom, right-click to pan
- **Debug UI** — [Tweakpane](https://tweakpane.github.io/docs/) panel for real-time parameter adjustment
- **Reactive rendering** — Only renders when scene changes (power efficient)

### Planned
- **CDLOD terrain** — [Continuous Distance-Dependent LOD](https://github.com/fstrugar/CDLOD) with 12+ detail levels for seamless orbital-to-surface zoom
- **Hapke BRDF** — [Physically accurate lunar reflectance](https://en.wikipedia.org/wiki/Hapke_parameters) modeling the unique way light scatters in lunar dust: bright "opposition surge" when the Sun is behind you, and no limb darkening (the Moon looks like a flat disk, not a shaded sphere)
- **Displacement mapping** — Real terrain from [NASA LDEM](https://astrogeology.usgs.gov/search/map/Moon/LRO/LOLA/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014) (Lunar Digital Elevation Model) at 16 pixels per degree
- **Ephemeris calculations** — Accurate Sun and Moon positions for any date, time, and observer location using algorithms from [Astronomical Algorithms](https://en.wikipedia.org/wiki/Astronomical_Algorithms) (Jean Meeus)
- **Accurate phase rendering** — Correct illumination fraction, bright limb orientation, and parallactic angle (how the Moon's "tilt" changes as it crosses the sky)

## Controls

| Action | Input |
|--------|-------|
| Orbit | Left-click + drag |
| Zoom | Scroll wheel |
| Pan | Right-click + drag |

Tweakpane UI (top-right) adjusts light, ambient, and material properties.

## What's Working

- **M1:** WebGPU initialization, reactive render loop, canvas resize
- **M2:** Triangle rendering, geometry buffers, solid color shader
- **M3:** Scene graph, camera, orbit controls, depth buffer
- **M4:** Blinn-Phong lighting, directional light, Tweakpane debug UI
- **M5:** glTF model loading, auto camera framing, FPS counter
- **M7:** Textured Moon with NASA color map, KTX2 texture pipeline
- **M8:** Quadtree data structure for spherified cube (6 faces, 12+ LOD levels)
- **M9:** LOD selection with screen-space error metric, frustum culling, RTE positioning

## What's Planned

### CDLOD Terrain System (Milestones 10-19)

A full [CDLOD](https://github.com/fstrugar/CDLOD) (Continuous Distance-Dependent Level of Detail) implementation for planetary-scale rendering. This technique divides the Moon's surface into a quadtree of patches, rendering nearby areas in high detail while distant areas use coarser geometry — enabling seamless zoom from orbit to surface.

- **M8-M9:** ✅ CPU-side quadtree on a [spherified cube](https://catlikecoding.com/unity/tutorials/cube-sphere/), view frustum culling, LOD selection with screen-space error metric
- **M10:** Debug wireframe visualization with color-coded LOD levels
- **M11-M13:** GPU instanced rendering (draw thousands of terrain patches in one call), cube-to-sphere projection, displacement mapping using [NASA LDEM](https://astrogeology.usgs.gov/search/map/Moon/LRO/LOLA/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014) elevation data
- **M14-M16:** [Geomorphing](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry) (smoothly blend between LOD levels to eliminate "popping"), analytic normal reconstruction for sharp lighting on coarse meshes
- **M17-M18:** Smooth [B-spline](https://en.wikipedia.org/wiki/B-spline) height sampling, [Hapke BRDF](https://en.wikipedia.org/wiki/Hapke_parameters) for physically accurate lunar dust reflectance
- **M19:** Tile-based texture streaming for datasets larger than GPU memory
- **M20:** Ray-traced self-shadowing via WebGPU compute shaders (accurate shadows in craters and mountains)

### Solar System Geometry (Milestones E1-E6, Unscheduled)

Astronomical calculations for accurate positioning and lighting, enabling realistic visualization for any date/time/location:

- **E1-E3:** [Julian date](https://en.wikipedia.org/wiki/Julian_day) and [sidereal time](https://en.wikipedia.org/wiki/Sidereal_time) conversion, solar and lunar position calculations (1-2 arcminute accuracy using [Meeus algorithms](https://en.wikipedia.org/wiki/Astronomical_Algorithms))
- **E4:** [Topocentric corrections](https://en.wikipedia.org/wiki/Topocentric_coordinates) — lunar parallax (the Moon shifts ~1° depending on where you stand on Earth), atmospheric refraction near the horizon
- **E5-E6:** Lunar phase calculation, [bright limb](https://en.wikipedia.org/wiki/Lunar_phase#Position_of_the_bright_limb) orientation, angular diameter variation (the Moon appears larger at perigee), time-lapse animation support

## Project Structure

```
src/
├── core/       # Viewer, Scene, Camera
├── objects/    # Object3D, Mesh, DirectionalLight
├── geometry/   # Geometry, primitives (cube, triangle)
├── materials/  # SolidMaterial, TexturedMaterial
├── loaders/    # GLTFLoader
├── controls/   # OrbitControls
├── terrain/    # CDLOD: QuadTree, LODSelector, Frustum, NodeData
├── shaders/    # blinn-phong.wgsl, textured-blinn-phong.wgsl
└── types/      # TypeScript type definitions

assets/
├── models/     # Committed glTF/GLB files (Duck, Utah Teapot)
└── lunar/      # NASA Moon data (downloaded at build time, LFS for model)

scripts/
├── download-assets.sh        # Fetches NASA lunar textures
└── convert-lunar-textures.sh # TIFF → PNG → KTX2 pipeline
```

## Testing

```bash
npm run test        # Unit tests (Vitest)
npm run test:smoke  # E2E smoke test (~5s)
npm run test:e2e    # Full E2E suite
```

## Tech Stack

| Tool | Purpose |
|------|---------|
| TypeScript 5.x | Strict mode, branded types |
| Vite | Dev server, HMR, .wgsl imports |
| wgpu-matrix | WebGPU-optimized matrix math |
| @loaders.gl/gltf | glTF/GLB model parsing |
| Tweakpane | Debug UI for parameters |
| stats.js | FPS counter |
| Vitest | Unit testing |
| Playwright | E2E testing (Firefox + WebGPU) |

## Documentation

| Document | Contents |
|----------|----------|
| [Plan.md](docs/Plan.md) | Full implementation roadmap with milestone details (M1-M20, E1-E6) |
| [CDLOD Design Doc.md](docs/CDLOD%20Design%20Doc.md) | Terrain LOD system: quadtree structure, vertex morphing to hide LOD transitions, Hapke reflectance model, and WGSL shader pseudocode |
| [Solar System Geometry Subsystem.md](docs/Solar%20System%20Geometry%20Subsystem.md) | Astronomical calculations: Julian dates, solar/lunar ephemeris, topocentric corrections, phase angles |
| [Design.md](docs/Design.md) | High-level architecture decisions and rationale |
| [Implementation.md](docs/Implementation.md) | Code structure, GPU buffer layouts, rendering pipeline flow |
| [BuildAndTest.md](docs/BuildAndTest.md) | How to build, test, and develop |

## Design Goals

- **Planetary-scale rendering** — Seamless zoom from orbit to surface using CDLOD and [relative-to-eye](https://help.agi.com/AGIComponents/html/BlogPrecisionsPrecworseionsPrecisions.htm) positioning (avoids floating-point jitter at large distances)
- **Physical accuracy** — Hapke reflectance model for realistic lunar appearance, accurate ephemeris for correct Sun/Moon positions, topocentric corrections for observer-specific views
- **Three.js-style API** — Familiar scene graph with meshes, materials, and cameras (if you've used [Three.js](https://threejs.org/), you'll feel at home)
- **Hybrid pipeline** — Standard rasterization for geometry, GPU compute shaders for ray-traced shadows
- **Reactive rendering** — Only re-render when something changes (saves battery on laptops)

## License

MIT
