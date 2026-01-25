# LunaVis

A WebGPU lunar visualization built from scratch in TypeScript. Features textured Moon rendering with NASA imagery, Blinn-Phong lighting, glTF model loading, and orbit controls.

**Status:** M7 complete — Textured Moon with NASA color map

## Quick Start

```bash
npm install
npm run download-assets  # Fetch lunar textures (~120 MB)
npm run dev
```

Open Firefox (with WebGPU enabled) at http://localhost:3000

### Enable WebGPU in Firefox
1. Go to `about:config`
2. Set `dom.webgpu.enabled` to `true`
3. Restart Firefox

> **Note:** Chrome has driver issues with Intel Arc GPUs on Linux. Firefox works reliably.

## Features

- **Textured Moon** — NASA LROC color map with KTX2 compression and mipmaps
- **glTF model loading** — Load .glb/.gltf models via @loaders.gl
- **Blinn-Phong lighting** — Ambient + diffuse + specular shading (specular disabled for Moon)
- **Auto camera framing** — Positions camera based on model bounding box
- **Camera-following light** — Illumination from upper-left shoulder position
- **Orbit controls** — Click-drag to rotate, scroll to zoom, right-click to pan
- **Debug UI** — Tweakpane panel for real-time parameter adjustment
- **FPS counter** — stats.js performance monitoring
- **Reactive rendering** — Only renders when scene changes (power efficient)

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

## What's Planned

- **M8:** Displacement mapping with NASA elevation data
- **M9:** Compute shader shadows via ray casting

## Project Structure

```
src/
├── core/       # Viewer, Scene, Camera
├── objects/    # Object3D, Mesh, DirectionalLight
├── geometry/   # Geometry, primitives (cube, triangle)
├── materials/  # SolidMaterial, TexturedMaterial
├── loaders/    # GLTFLoader
├── controls/   # OrbitControls
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
| [Plan.md](docs/Plan.md) | Original design + implementation roadmap |
| [Design.md](docs/Design.md) | Architecture decisions and rationale |
| [Implementation.md](docs/Implementation.md) | Code structure, data layouts, pipeline flow |
| [Configuration.md](docs/Configuration.md) | Tooling and project setup |
| [BuildAndTest.md](docs/BuildAndTest.md) | Build, test, and dev procedures |
| [DevLog.md](docs/DevLog.md) | Development history and notes |

## Design Goals

- **Three.js-style API** — Familiar scene graph, meshes, materials
- **Hybrid pipeline** — Rasterization + compute shaders (future)
- **Reactive rendering** — Dirty-flag pattern, no wasted frames
- **High-fidelity Moon** — 1M triangles, NASA imagery, displacement mapping (future)

## License

MIT
