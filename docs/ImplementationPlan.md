# LunaVis Implementation Plan (Phase 1-3)

Hybrid WebGPU 3D Model Viewer — Core rendering with scene graph, Blinn-Phong lighting, and camera controls.

## Development Philosophy

- **Rapid prototyping** with test support (Vitest)
- **Modular/reusable** but not gold-plated
- **Fail fast** — assertions and clear errors, not production bulletproofing
- **Extensive but concise** comments and documentation
- **Strongly typed** — leverage TypeScript's type system fully
- **High performance** — design for 50K+ triangles
- **Iterative** — each milestone produces a runnable demo

## Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript 5.x | Strong typing, IDE support |
| Build | Vite | Fast HMR, native .wgsl imports via `?raw` |
| Math | wgpu-matrix | WebGPU-optimized, column-major matrices |
| Testing | Vitest | Vite-native, fast, TypeScript-first |
| Debug UI | tweakpane | Lightweight, WebGPU-friendly |
| FPS | stats.js | Standard, minimal |
| Target | Chrome/Edge | Stable WebGPU, no fallback |

## Project Structure

```
LunaVis/
├── src/
│   ├── core/
│   │   ├── Viewer.ts          # GPUDevice, context, reactive loop
│   │   ├── Renderer.ts        # Pipeline orchestration
│   │   ├── Scene.ts           # Root container, scene graph
│   │   └── Camera.ts          # Perspective projection, view matrix
│   ├── objects/
│   │   ├── Object3D.ts        # Base class: transform hierarchy
│   │   ├── Mesh.ts            # Geometry + Material linkage
│   │   └── DirectionalLight.ts
│   ├── geometry/
│   │   ├── Geometry.ts        # CPU-side vertex data
│   │   └── primitives.ts      # createCube(), createTriangle()
│   ├── materials/
│   │   └── SolidMaterial.ts   # Solid color, bind group, pipeline
│   ├── loaders/
│   │   └── GLTFLoader.ts      # Minimal: positions, normals, indices
│   ├── controls/
│   │   ├── OrbitControls.ts   # Rotate, zoom, pan around target
│   │   └── FlyControls.ts     # WASD + mouse look
│   ├── shaders/
│   │   ├── blinn-phong.wgsl   # Vertex + fragment
│   │   └── types.wgsl         # Shared struct definitions
│   ├── types/
│   │   └── index.ts           # Shared TypeScript types
│   └── main.ts                # Entry point, demo setup
├── tests/
│   ├── geometry.test.ts
│   ├── math.test.ts
│   └── scene.test.ts
├── public/
│   └── assets/                # Test .glb files
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

## Bind Group Layout

| Group | Scope | Contents |
|-------|-------|----------|
| 0 | Global (per-frame) | Camera uniforms (view, projection), Light uniforms (direction, color) |
| 1 | Material | Color uniform (vec4) |
| 2 | Object (per-draw) | Model matrix (mat4x4) |

## Milestones

### M1: WebGPU Initialization
**Goal:** Blank canvas clears to a color.

**Deliverables:**
- Vite + TypeScript project scaffold
- `Viewer` class: `requestAdapter()`, `requestDevice()`, `configureContext()`
- Reactive render loop with dirty flag
- `ResizeObserver` handling
- Clear screen to cornflower blue

**Tests:**
- Viewer initializes without error (mock adapter)

**Files:** `core/Viewer.ts`, `main.ts`, `index.html`, config files

---

### M2: Triangle Rendering
**Goal:** Hardcoded colored triangle on screen.

**Deliverables:**
- `Geometry` class: positions, normals, indices → GPU buffers
- `SolidMaterial` class: color uniform, render pipeline
- `Mesh` class: links Geometry + Material
- `Renderer.render()`: encode draw commands
- `primitives.ts`: `createTriangle()`

**Tests:**
- Geometry buffer creation
- Primitive generation

**Files:** `geometry/`, `materials/SolidMaterial.ts`, `objects/Mesh.ts`, `core/Renderer.ts`, `shaders/solid.wgsl`

---

### M3: Scene Graph & Camera
**Goal:** Rotating cube with mouse orbit controls.

**Deliverables:**
- `Object3D` base class: position, rotation, scale, parent/children, world matrix
- `Scene` class: root container, traversal
- `Camera` class: perspective projection, view matrix, uniform buffer
- `OrbitControls`: pointer events → camera updates → `requestRender()`
- `primitives.ts`: `createCube()`

**Tests:**
- Object3D transform hierarchy
- Camera matrix generation
- Scene traversal

**Files:** `objects/Object3D.ts`, `core/Scene.ts`, `core/Camera.ts`, `controls/OrbitControls.ts`

---

### M4: Blinn-Phong Lighting
**Goal:** Lit cube with directional light, ambient + diffuse + specular.

**Deliverables:**
- `DirectionalLight` class: direction, color, intensity
- `blinn-phong.wgsl`: full lighting calculation
- Update bind group 0 with light uniforms
- Debug UI (tweakpane): light direction, color

**Tests:**
- Light uniform packing
- Normal transformation

**Files:** `objects/DirectionalLight.ts`, `shaders/blinn-phong.wgsl`, update `Renderer.ts`

---

### M5: glTF Loading
**Goal:** Load and display a .glb model.

**Deliverables:**
- `GLTFLoader`: parse binary, extract positions/normals/indices
- Handle accessor/bufferView unpacking
- Load test model (e.g., Suzanne, Duck)
- stats.js integration for FPS

**Tests:**
- Accessor unpacking
- Buffer view slicing

**Files:** `loaders/GLTFLoader.ts`, `public/assets/`

---

### M6: Fly Controls
**Goal:** Toggle between orbit and fly camera modes.

**Deliverables:**
- `FlyControls`: WASD movement, mouse look, pointer lock
- Control mode toggle (keyboard shortcut or UI)
- README with usage instructions

**Tests:**
- Input state handling

**Files:** `controls/FlyControls.ts`, `README.md`

---

## Shader Architecture

### blinn-phong.wgsl

```wgsl
// Group 0: Global uniforms
struct CameraUniforms {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
    position: vec3<f32>,  // For specular calculation
}

struct LightUniforms {
    direction: vec3<f32>,
    color: vec3<f32>,
    intensity: f32,
    ambient: vec3<f32>,
}

// Group 1: Material
struct MaterialUniforms {
    color: vec4<f32>,
    shininess: f32,
}

// Group 2: Object
struct ObjectUniforms {
    model: mat4x4<f32>,
    normalMatrix: mat4x4<f32>,  // Inverse transpose of model
}
```

## Uniform Buffer Alignment

All uniforms follow WGSL alignment rules (16-byte for vec3/vec4/mat4):

```typescript
// Example: CameraUniforms (208 bytes)
// view:       0-63   (64 bytes, mat4x4)
// projection: 64-127 (64 bytes, mat4x4)
// position:   128-139 (12 bytes, vec3)
// _padding:   140-143 (4 bytes)
```

## Type Strategy

- **Branded types** for IDs: `type MeshId = string & { readonly __brand: 'MeshId' }`
- **Discriminated unions** for polymorphism: `type Light = DirectionalLight | PointLight`
- **Readonly by default** for immutable data
- **Strict null checks** enabled

## Performance Considerations

- **Reactive rendering:** Only render on dirty flag, not continuous RAF
- **Buffer reuse:** Pre-allocate uniform buffers, update via `writeBuffer()`
- **Batch by material:** Sort meshes to minimize pipeline switches (future)
- **Typed arrays:** Use `Float32Array` for all GPU data

## Deferred (Phase 4+)

- Compute shader shadows (ray-casting)
- BVH acceleration structure
- Texture support (diffuse, normal maps)
- Multiple lights
- PBR materials
- Instanced rendering

## Testing Strategy

### Overview

| Test Type | Framework | Target Time | Purpose |
|-----------|-----------|-------------|---------|
| Unit | Vitest | < 1s | Pure functions, type helpers, geometry math |
| Smoke | Playwright | < 10s | Quick "did I break it?" check |
| E2E | Playwright | < 30s | Thorough verification after features |

### Unit Tests (Vitest)

**Scope:**
- Pure functions: geometry generation, vector math, type utilities
- Viewer class with mocked WebGPU (verify method calls, not rendering)
- No GPU required — runs in Node

**Location:** `tests/*.test.ts`

**Run:** `npm run test` or `npm run test:watch`

### Smoke Test (Playwright + Firefox)

**Purpose:** Quick iteration feedback during development.

**What it verifies:**
1. Firefox launches with WebGPU enabled
2. Page loads without JS errors
3. `[LunaVis] Ready` marker appears in console
4. Canvas has non-zero dimensions

**Browser:** Firefox (headed mode, WebGPU requires display)

**Location:** `tests/e2e/smoke.spec.ts`

**Run:** `npm run test:smoke`

### E2E Test (Playwright + Firefox)

**Purpose:** Thorough verification after completing a milestone.

**What it verifies:**
1. All smoke test checks
2. Milestone-specific console markers (e.g., `[LunaVis] Mesh created`)
3. Window resize triggers re-render
4. No WebGPU device lost errors
5. (Future) Interaction tests, visual regression

**Location:** `tests/e2e/*.spec.ts`

**Run:** `npm run test:e2e`

### Console Marker System

Structured logging for test verification:

```typescript
// Human-readable
console.info('[LunaVis] Ready');

// Machine-parseable (for test assertions)
console.info(JSON.stringify({
  event: 'ready',
  version: '0.1.0',
  adapter: 'NVIDIA RTX 3500'
}));
```

**Standard Events:**
| Event | Milestone | Description |
|-------|-----------|-------------|
| `ready` | M1 | Viewer initialized, first frame rendered |
| `mesh-created` | M2 | Mesh added to scene |
| `shader-compiled` | M2 | Render pipeline created |
| `frame-rendered` | M2+ | Render pass completed |
| `resize` | M3 | Canvas resized |

### Test Infrastructure

**Playwright Configuration:**
- Firefox with `dom.webgpu.enabled: true`
- Headed mode (WebGPU needs display)
- Dev server auto-start via `webServer` config
- Console capture and assertion helpers

**File Structure:**
```
tests/
├── e2e/
│   ├── smoke.spec.ts      # Quick smoke test
│   ├── m2-triangle.spec.ts # M2 verification
│   └── helpers.ts         # Console capture utilities
├── viewer.test.ts         # Unit tests
└── geometry.test.ts       # Geometry unit tests
```

### Visual Regression (Deferred)

Screenshot comparison for detecting rendering changes. Will add after M4 when visuals stabilize:
- Baseline screenshots per milestone
- Pixel diff threshold for minor variations
- Manual approval workflow for intentional changes

## Commands

```bash
# Development
npm run dev          # Start Vite dev server

# Unit Testing
npm run test         # Run Vitest unit tests
npm run test:watch   # Watch mode

# E2E Testing
npm run test:smoke   # Quick smoke test (< 10s)
npm run test:e2e     # Full E2E suite (< 30s)

# Build
npm run build        # Production build
npm run preview      # Preview production build
```
