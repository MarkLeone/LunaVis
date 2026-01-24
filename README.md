# LunaVis

A WebGPU 3D model viewer built from scratch in TypeScript. Uses a hybrid rendering pipeline: rasterization for geometry, compute shaders for ray-casted shadows (planned).

**Status:** Early development (M1 complete, M2 in progress)

## Quick Start

```bash
npm install
npm run dev
```

Open Firefox (with WebGPU enabled) at http://localhost:3000

### Enable WebGPU in Firefox
1. Go to `about:config`
2. Set `dom.webgpu.enabled` to `true`
3. Restart Firefox

> **Note:** Chrome has driver issues with Intel Arc GPUs on Linux. Firefox works reliably.

## What's Working

- **M1:** WebGPU initialization, reactive render loop, canvas resize handling
- Blue screen of success (cornflower blue, #6495ED)

## What's Planned

- **M2:** Triangle rendering with solid color materials
- **M3:** Scene graph, camera, orbit controls
- **M4:** Blinn-Phong lighting with directional light
- **M5:** glTF model loading
- **M6:** Fly controls (WASD + mouse look)
- **Phase 2:** Compute shader shadows via ray casting

## Project Structure

```
src/
├── core/       # Viewer, Renderer, Scene, Camera
├── objects/    # Object3D, Mesh, Lights
├── geometry/   # Geometry, primitives
├── materials/  # Material classes
├── loaders/    # glTF loader
├── controls/   # OrbitControls, FlyControls
├── shaders/    # WGSL shaders
└── types/      # TypeScript types
```

## Testing

```bash
npm run test        # Unit tests (Vitest)
npm run test:smoke  # E2E smoke test (Playwright + Firefox, ~5s)
npm run test:e2e    # Full E2E suite
```

## Tech Stack

- **TypeScript 5.x** — Strict mode, branded types
- **Vite** — Fast dev server, HMR, raw .wgsl imports
- **wgpu-matrix** — WebGPU-optimized matrix math
- **Vitest** — Unit testing
- **Playwright** — E2E testing with Firefox

## Documentation

See `docs/` for detailed documentation:
- `Plan.md` — Original design document
- `ImplementationPlan.md` — Refined scope and milestones
- `Configuration.md` — Project setup reference
- `DevLog.md` — Development log and decisions

## Design Goals

- **Three.js-style API** — Familiar scene graph, meshes, materials
- **Hybrid pipeline** — Rasterization + compute shaders
- **Reactive rendering** — Only render when dirty (power efficient)
- **50K+ triangles** — BVH acceleration for compute shadows (future)

## License

MIT
