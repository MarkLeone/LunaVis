# LunaVis Development Log

## 2026-01-24: Project Inception & M1 Complete

### Requirements Gathering

Conducted requirements interview to refine the initial Plan.md into an actionable implementation plan.

**Key Decisions:**
- **Scope:** Phase 1-3 only (core rendering, no compute shadows yet)
- **Model complexity:** Design for 50K+ triangles (acceleration structures deferred)
- **glTF:** Minimal loader — positions, normals, indices only
- **Camera:** Both orbit and fly controls
- **Lighting:** Blinn-Phong with single directional light, solid color materials initially
- **Project structure:** Shallow by type (`src/core/`, `src/objects/`, etc.)

**Development Philosophy:**
- Test-supported rapid prototyping (Vitest)
- Modular but not gold-plated
- Fail fast with assertions, not production bulletproofing
- Strongly typed ("typeful" approach)
- Iterative with end-to-end milestones

**Milestones Defined:**
1. M1: WebGPU init — blank canvas clears to color
2. M2: Triangle rendering — hardcoded colored triangle
3. M3: Scene graph & camera — rotating cube with orbit
4. M4: Blinn-Phong lighting — lit cube with directional light
5. M5: glTF loading — load and display .glb model
6. M6: Fly controls — toggle orbit/fly modes

---

### M1: WebGPU Initialization ✓

**Goal:** Blank canvas clears to cornflower blue.

**Completed:**
- Scaffolded Vite + TypeScript project
- Created `Viewer` class with:
  - `requestAdapter()` / `requestDevice()` initialization
  - Canvas context configuration with preferred format
  - Reactive render loop (dirty-flag pattern)
  - `ResizeObserver` for responsive canvas sizing
  - Device-lost recovery handling
- Created type system foundation:
  - Branded types for `MeshId`, `MaterialId`
  - `Result<T, E>` type with `ok()`, `err()`, `isOk()`, `isErr()` helpers
  - `GPUContext`, `ViewerOptions`, `RenderState` interfaces
- Entry point with user-friendly error display for WebGPU failures
- Basic test suite (4 tests passing)

**Files Created:**
```
src/
├── core/Viewer.ts          # 156 lines
├── types/index.ts          # 78 lines
└── main.ts                 # 47 lines
tests/
└── viewer.test.ts          # 38 lines
```

**Verification:** Dev server runs, canvas clears to cornflower blue (#6495ED).

---

### Testing Infrastructure ✓

**Goal:** Automated smoke and E2E tests with Firefox + WebGPU.

**Completed:**
- Playwright installed with Firefox browser
- Console marker system for test verification:
  - Human-readable: `[LunaVis] Ready`
  - Machine-parseable: `{"event":"ready","version":"0.1.0"}`
- Smoke test (~5s): verifies init, no errors, canvas rendered
- E2E helpers: `captureConsole()`, `waitForEvent()`, `hasMarker()`

**Node 19 Compatibility:**
- Playwright requires Node 18.19+ for ESM modules
- Workaround: Use `.cjs` extension for all Playwright files
- Config, helpers, and specs all use CommonJS

See [BuildAndTest.md](BuildAndTest.md) for test commands and procedures.

---

### M2: Triangle Rendering ✓

**Goal:** Hardcoded red triangle on cornflower blue background.

**Completed:**
- `Geometry` class with:
  - Positions, normals, indices storage
  - GPU buffer creation with proper 4-byte alignment
  - Uint16/Uint32 index format auto-detection
- `SolidMaterial` class with:
  - WGSL shader module
  - Uniform buffer for color (vec4)
  - Bind group and render pipeline creation
  - Dynamic color updates via `needsUpdate` flag
- `Mesh` class linking Geometry + Material
- `Viewer.addMesh()`/`removeMesh()` for scene management
- `createTriangle()` primitive generator
- Vite type declarations for `.wgsl?raw` imports
- Updated smoke test to verify `mesh-created` event

**Files Created:**
```
src/
├── geometry/
│   ├── Geometry.ts       # CPU vertex data + GPU buffers
│   └── primitives.ts     # createTriangle(), createCube()
├── materials/
│   └── SolidMaterial.ts  # Flat color material
├── objects/
│   └── Mesh.ts           # Geometry + Material linkage
├── shaders/
│   └── solid.wgsl        # Pass-through vertex + flat color fragment
└── vite-env.d.ts         # Vite asset type declarations
```

**Technical Notes:**
- WebGPU `writeBuffer` requires 4-byte aligned data; Uint16Array indices need padding
- TypeScript 5.x typed arrays (`Float32Array<ArrayBufferLike>`) need type assertions for WebGPU APIs
- Shader uses pass-through vertex transformation (no MVP yet)

**Verification:** Red triangle renders on cornflower blue background. E2E test passes.

---

### M3: Scene Graph & Camera ✓

**Goal:** Rotating cube with mouse orbit controls.

**Completed:**
- `Object3D` base class with:
  - Position, rotation (Euler angles), scale properties
  - Parent/child hierarchy with `add()`/`remove()`
  - Cached local and world matrix computation
  - Quaternion-based rotation from Euler angles (XYZ order)
  - `traverse()` for scene graph iteration
- `Scene` class extending Object3D:
  - Root container for scene graph
  - `getMeshes()` for render traversal
- `Camera` class with:
  - Perspective projection matrix
  - View matrix via `mat4.lookAt()` (position/target/up)
  - Combined view-projection matrix
  - Aspect ratio updates on resize
- `OrbitControls` with:
  - Spherical coordinates (radius, polar, azimuth)
  - Click+drag to orbit, scroll to zoom, right-click to pan
  - Polar angle clamping to avoid gimbal lock
  - `onUpdate` callback for render requests
- Updated `SolidMaterial` with:
  - Three bind group layouts (global, material, model)
  - Explicit pipeline layout for bind group sharing
- Updated `Mesh` extending Object3D:
  - Per-instance model matrix uniform buffer
  - Render method accepting global bind group
- Updated `solid.wgsl` shader:
  - MVP transform: `viewProjection * model * position`
  - Bind groups: 0=camera, 1=material, 2=model
- Depth buffer for proper 3D rendering

**Files Created/Updated:**
```
src/
├── objects/Object3D.ts     # Base transform class (new)
├── core/Scene.ts           # Scene graph root (new)
├── core/Camera.ts          # Perspective camera (new)
├── controls/OrbitControls.ts # Mouse orbit (new)
├── core/Viewer.ts          # Scene/camera management (updated)
├── objects/Mesh.ts         # Extends Object3D (updated)
├── materials/SolidMaterial.ts # 3-group layout (updated)
└── shaders/solid.wgsl      # MVP transforms (updated)
```

**Technical Notes:**
- Camera uses `mat4.lookAt()` directly for view matrix rather than computing inverse of world matrix from Euler angles — more reliable for camera orientation
- wgpu-matrix uses column-major matrices matching WebGPU/WGSL expectations
- Cube uses clockwise winding with `frontFace: 'cw'` in pipeline
- Global bind group layout shared between Viewer and SolidMaterial for consistent binding

**Verification:** Red-orange cube rotates continuously. Orbit controls allow interactive camera movement. E2E test passes.

---

### M4: Blinn-Phong Lighting ✓

**Goal:** Lit cube with directional light, ambient + diffuse + specular.

**Completed:**
- `DirectionalLight` class with:
  - Direction (normalized), color, intensity
  - `effectiveColor` getter (color × intensity)
  - `needsUpdate` flag for uniform sync
- `blinn-phong.wgsl` shader with:
  - Ambient component (ambient color × material color)
  - Diffuse component (Lambertian: NdotL)
  - Specular component (Blinn-Phong: NdotH^shininess)
  - World-space lighting calculations
- Expanded global uniforms (128 bytes):
  - viewProjection matrix (64 bytes)
  - cameraPosition (16 bytes, for specular)
  - lightDirection (16 bytes)
  - lightColor (16 bytes)
  - ambientColor (16 bytes)
- Updated `SolidMaterial` with:
  - Shininess parameter (default: 32)
  - 32-byte uniform buffer (color + shininess)
- Tweakpane debug UI:
  - Light: direction (X/Y/Z sliders), color picker, intensity
  - Ambient: color picker
  - Material: color picker, shininess slider

**Files Created/Updated:**
```
src/
├── objects/DirectionalLight.ts  # New: light class
├── shaders/blinn-phong.wgsl     # New: Blinn-Phong shader
├── core/Viewer.ts               # Updated: light + 128-byte uniforms
├── materials/SolidMaterial.ts   # Updated: shininess, new shader
└── main.ts                      # Updated: light + tweakpane UI
```

**Dependencies Added:**
- `tweakpane@4` — lightweight debug UI
- `@tweakpane/core` — type definitions

**Technical Notes:**
- Light direction in shader is negated (points toward light source for NdotL)
- Specular uses halfway vector H = normalize(L + V) for Blinn-Phong
- Global bind group visible to both VERTEX and FRAGMENT stages

**Verification:** Cube displays realistic shading. Light/material params adjustable via UI. E2E test passes.

---

## Upcoming

### M5: glTF Loading (Next)
- `GLTFLoader` class to parse .glb files
- Extract positions, normals, indices from accessors
- Load test model (Suzanne, Duck, etc.)
- stats.js integration for FPS display

---

## Notes

- Node v19.9.0 triggers engine warnings (Vite wants 18/20/22+) but works
- Dev server defaults to port 3000, falls back to 3001/3002 if occupied
- Viewer instance exposed to `window.viewer` for console debugging

---

## GPU Driver Issues (Hybrid Laptop)

**System:** Intel Arc (integrated) + NVIDIA RTX 3500 Ada (discrete)

**Problem:** Chrome WebGPU defaults to Intel Arc GPU, which has Vulkan driver bugs:
- `VK_ERROR_OUT_OF_DEVICE_MEMORY` on `vkAllocateMemory`
- Persists across Chrome restarts and system reboots
- `powerPreference: 'high-performance'` hint ignored

**Attempted Chrome Workarounds (all failed):**
- `DRI_PRIME=1` — adapter acquisition fails
- `VK_ICD_FILENAMES=/etc/vulkan/icd.d/nvidia_icd.json` — "external Instance reference" error
- Various `--use-vulkan`, `--enable-features=Vulkan` flags — same Intel driver error

**Working Solution:** Use Firefox with WebGPU enabled:
1. `about:config` → `dom.webgpu.enabled` → `true`
2. Restart Firefox
3. Firefox correctly uses the NVIDIA GPU for WebGPU

**Recommendation:** Develop with Firefox on this hardware until Chrome/Intel driver issues are resolved.
