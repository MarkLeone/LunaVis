# LunaVis

A WebGPU 3D model viewer built from scratch in TypeScript. Features Blinn-Phong lighting, orbit controls, and a debug UI. Future plans include compute shader ray-casted shadows.

**Status:** M4 complete — Lit cube with interactive controls

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

- **Blinn-Phong lighting** — Ambient + diffuse + specular shading
- **Directional light** — Adjustable direction, color, intensity
- **Orbit controls** — Click-drag to rotate, scroll to zoom, right-click to pan
- **Debug UI** — Tweakpane panel for real-time parameter adjustment
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

## What's Planned

- **M5:** glTF model loading
- **M6:** Fly controls (WASD + mouse look)
- **Phase 2:** Compute shader shadows via ray casting

## Project Structure

```
src/
├── core/       # Viewer, Scene, Camera
├── objects/    # Object3D, Mesh, DirectionalLight
├── geometry/   # Geometry, primitives (cube, triangle)
├── materials/  # SolidMaterial (Blinn-Phong)
├── controls/   # OrbitControls
├── shaders/    # blinn-phong.wgsl
└── types/      # TypeScript type definitions

assets/
├── models/     # Committed glTF/GLB files
└── lunar/      # NASA Moon data (downloaded at build time)

scripts/
└── download-assets.sh  # Fetches external assets
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
| Tweakpane | Debug UI for parameters |
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
- **50K+ triangles** — Designed for real glTF models

## License

MIT
