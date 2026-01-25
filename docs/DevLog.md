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

### M4 Bugfix: WGSL Alignment & Test Coverage ✓

**Problem:** GPU hang on Firefox when loading the Blinn-Phong shader.

**Root Cause:** WGSL struct alignment bug in `MaterialUniforms`:
```wgsl
// BROKEN: vec3<f32> has 16-byte alignment in uniform buffers
struct MaterialUniforms {
    color: vec4<f32>,      // 16 bytes
    shininess: f32,        // 4 bytes
    _pad: vec3<f32>,       // WRONG: starts at offset 32 (16-byte aligned), not 20!
}
// Actual size: 44 bytes rounded to 48, but buffer was only 32 bytes!
```

**Fix:** Use `f32` padding instead of `vec3<f32>`:
```wgsl
struct MaterialUniforms {
    color: vec4<f32>,      // offset 0, 16 bytes
    shininess: f32,        // offset 16, 4 bytes
    _pad0: f32,            // offset 20, 4 bytes
    _pad1: f32,            // offset 24, 4 bytes
    _pad2: f32,            // offset 28, 4 bytes — total 32 bytes
}
```

**Why Tests Missed It:** The E2E test only waited for `ready` event, which fires *before* the render loop executes. The GPU hang happened during async rendering, after the test had already passed.

**Test Improvement:** Added `frame-rendered` event emitted after first successful `device.queue.submit()`. E2E test now waits for this event, ensuring GPU commands actually execute without hanging.

**Files Updated:**
- `src/shaders/blinn-phong.wgsl` — fixed struct alignment
- `src/core/Viewer.ts` — emit `frame-rendered` event
- `tests/e2e/smoke.spec.cjs` — wait for `frame-rendered`
- `tests/e2e/playwright.config.cjs` — `reuseExistingServer: true`

**Lesson Learned:** WGSL uniform struct alignment follows strict rules:
- `vec3<f32>` has **16-byte alignment** in uniform address space
- Use `f32` padding fields to maintain precise byte offsets
- Always verify CPU buffer layout matches shader struct layout

---

### M5: glTF Loading ✓

**Goal:** Load and display glTF/GLB models with automatic camera framing.

**Completed:**
- `GLTFLoader` class wrapping `@loaders.gl/gltf`:
  - Parses .glb/.gltf files via `load()` + `postProcessGLTF()`
  - Extracts positions, normals, indices from accessors
  - Auto-generates flat normals when NORMAL attribute missing
  - Uint16/Uint32 index format based on vertex count
- stats.js FPS counter (top-left corner)
- Model selection UI (Utah Teapot, Duck)
- Bounding box calculation for loaded meshes
- Auto camera positioning:
  - Computes combined bounds across all primitives
  - Positions camera at 2.5× model size along +Z axis
  - Sets orbit target to model center
- `OrbitControls.reset()` to sync after programmatic camera changes
- Camera-following light (upper-left shoulder position):
  - Computes camera-relative direction from view/up/right vectors
  - Updates on every camera move for consistent illumination
- `Scene.clear()` for model switching
- Unit tests for camera positioning and OrbitControls sync

**Files Created/Updated:**
```
src/
├── loaders/GLTFLoader.ts     # New: glTF parsing + mesh extraction
├── controls/OrbitControls.ts # Updated: reset() method
├── core/Scene.ts             # Updated: clear() method
└── main.ts                   # Updated: model selection, FPS, auto-framing
assets/
├── models/utah_teapot.glb    # 760KB, ~16K triangles
├── models/Duck.glb           # 120KB, classic glTF test model
└── CREDITS.md                # Asset attribution
```

**Dependencies Added:**
- `@loaders.gl/core` — loader framework
- `@loaders.gl/gltf` — glTF parser
- `stats.js` — FPS counter

**Technical Notes:**
- Y-up coordinate system throughout (matches glTF spec)
- Light direction computed as `-right*0.4 + camUp*0.4 + view*0.8` for upper-left shoulder effect
- Model configs stored in `MODELS` map with path and default color

**Verification:** Utah Teapot and Duck load and display with proper framing. E2E test passes.

---

### M6: Fly Controls (Skipped)

M6 was deferred in favor of Moon rendering. Orbit controls sufficient for current use cases.

---

### M7: Textured Moon Rendering ✓

**Goal:** Render textured Moon sphere with NASA color map.

M7 was implemented across multiple commits building the asset pipeline and texture support.

#### Asset Pipeline Setup

**NASA Lunar Assets:**
- Build-time asset download via `scripts/download-assets.sh`
- Downloads NASA CGI Moon Kit from SVS (~120MB):
  - `lroc_color_16bit_srgb_4k.tif` — 4K color map
  - `ldem_16.tif` — displacement map (for future milestones)
- Assets excluded from git via `.gitignore`
- Attribution in `assets/lunar/README.md`

**KTX2 Texture Conversion:**
- `scripts/convert-lunar-textures.sh` (TIFF → PNG → KTX2)
- Color map conversion:
  - 16-bit sRGB TIFF → 8-bit PNG (ImageMagick)
  - PNG → KTX2 with mipmaps + Zstd compression (ktx tool)
  - Format: R8G8B8_SRGB for GPU sRGB linearization
- Displacement map kept as TIFF for compute shader processing (future)

**Moon Sphere Model:**
- NASA CGI Moon Kit from Sketchfab (Thomas Flynn, CC-BY-4.0)
- ~1M triangles, 516K vertices with UV coordinates
- `scene.bin` tracked via Git LFS (75MB)
- Bundled texture removed; uses converted `moon_color.ktx2`

#### Texture Material Implementation

**Completed:**
- `TexturedMaterial` class with:
  - GPUTexture + GPUSampler management
  - Color multiplier, shininess, specularIntensity parameters
  - Trilinear filtering with mipmap support
  - 32-byte uniform buffer (color + shininess + specularIntensity + padding)
- `textured-blinn-phong.wgsl` shader:
  - UV attribute input (location 2)
  - Texture sampling via `textureSample()`
  - Blinn-Phong with controllable specular intensity
  - `specularIntensity` uniform to disable specular (lunar regolith is purely diffuse)
- Extended `Geometry` to support optional UV coordinates
- Updated `GLTFLoader`:
  - Extracts `TEXCOORD_0` attribute
  - Loads images via loaders.gl
  - Creates GPU textures with `createTextureFromImage()`
  - Returns `TexturedMaterial` when texture available
- Moon model config with `specularIntensity: 0`
- Resolution cap at 2048px to prevent Firefox WebGPU crash on large displays
- Background color changed to black

**Files Created/Updated:**
```
src/
├── materials/TexturedMaterial.ts     # New: textured Blinn-Phong material
├── shaders/textured-blinn-phong.wgsl # New: UV sampling + lighting
├── geometry/Geometry.ts              # Updated: optional uvs parameter
├── loaders/GLTFLoader.ts             # Updated: TEXCOORD_0, image loading
├── core/Viewer.ts                    # Updated: 2048px cap, black background
├── objects/Mesh.ts                   # Updated: TexturedMaterial support
└── main.ts                           # Updated: Moon model config
assets/lunar/
├── scene.gltf + scene.bin            # Moon sphere model (LFS)
├── moon_color.ktx2                   # Converted color texture
├── download.sh                       # NASA asset fetcher
├── README.md                         # Attribution + format notes
└── license.txt                       # CC-BY-4.0
scripts/
├── download-assets.sh                # Asset discovery + download
└── convert-lunar-textures.sh         # TIFF→PNG→KTX2 pipeline
```

**Technical Notes:**
- Specular disabled for Moon (`specularIntensity: 0`) — lunar regolith is a diffuse reflector
- 8-bit sRGB sufficient for albedo textures; GPU linearizes on sample
- Resolution cap prevents `VK_ERROR_OUT_OF_DEVICE_MEMORY` on high-DPI displays
- KTX2 with Zstd compression reduces texture size while preserving quality

**Verification:** Textured Moon renders with diffuse-only lighting. NASA color map displays correctly.

---

## 2026-01-25: CDLOD Foundation

### M8: Quadtree Data Structure ✓

**Goal:** CPU-side quadtree representing spherified cube terrain for CDLOD.

**Completed:**
- `QuadNode` class with:
  - UV coordinates on cube face (0-1 range)
  - Double-precision storage (`Float64Array`) for LOD 12+ accuracy
  - Bounding sphere calculation (cached)
  - `subdivide()` / `collapse()` for lazy tree management
  - `uvToCubeDirection()` + `normalizeToSphere()` for coordinate mapping
- `QuadTree` class with:
  - 6 root nodes (one per cube face)
  - Traversal methods: `traverse()`, `traverseConditional()`, `collectLeaves()`
  - Statistics: `getStats()` returns node counts, LOD histogram
  - `reset()` to collapse tree to roots only
- Branded types: `QuadNodeId`, `FaceId`
- Comprehensive unit tests (38 tests)

**Files Created:**
```
src/terrain/
├── QuadNode.ts       # 290 lines — node with UV coords, bounding sphere
└── QuadTree.ts       # 160 lines — 6-face tree manager
src/types/index.ts    # Updated: QuadNodeId, FaceId
tests/quadtree.test.ts # 38 tests for construction, traversal, precision
```

**Design Decisions:**
- **Lazy subdivision:** Nodes created on demand during LOD selection
- **Object references:** Traditional tree, not flat array (easier debugging)
- **Unit sphere:** Quadtree uses radius=1, renderer applies planet scale
- **Right-handed Y-up:** Cube faces match existing coordinate conventions

**Technical Notes:**
- Bounding sphere uses corner sampling + 10% margin for surface curvature
- Child layout: SW(0), SE(1), NW(2), NE(3) — matches standard quadtree convention
- MAX_LOD_LEVEL = 15 (supports ~0.00003 UV resolution)

**Verification:** All 38 unit tests pass. Double precision verified at LOD 12+.

---

### M9: LOD Selection & Frustum Culling ✓

**Goal:** CPU traversal that selects visible nodes based on camera position and frustum.

**Completed:**
- `Frustum` class with:
  - Gribb/Hartmann plane extraction from view-projection matrix
  - `intersectsSphere()` for frustum culling
  - `containsSphere()` for full containment test
  - All calculations in double precision
- `NodeData` struct (32 bytes, GPU-aligned):
  - `relativeOrigin` (vec3), `scale`, `lodLevel`, `faceId`, `morphStart`, `morphEnd`
  - `packNodeData()` / `unpackNodeData()` for GPU upload
- `LODSelector` class with:
  - Screen-space error metric for adaptive LOD thresholds
  - `updateRanges(screenHeight, fov)` — recalculate on resize
  - `selectNodes(tree, cameraPos, frustum)` → NodeData[]
  - Automatic tree subdivision/collapse based on camera distance
  - RTE (Relative-to-Eye) position calculation with precision validation
  - Selection statistics (nodes visited, culled, per-level histogram)
- Barrel export: `src/terrain/index.ts`
- Unit tests: 25 for Frustum, 23 for LODSelector

**Files Created:**
```
src/terrain/
├── Frustum.ts       # 190 lines — frustum plane extraction + intersection
├── NodeData.ts      # 160 lines — GPU struct definition + packing
├── LODSelector.ts   # 300 lines — screen-space error LOD selection
└── index.ts         # Barrel export
tests/
├── frustum.test.ts      # 25 tests
└── lod-selector.test.ts # 23 tests
```

**Design Decisions:**
- **Screen-space error metric:** `distance = (nodeSize × screenHeight) / (maxPixelError × 2 × tan(fov/2))`
- **Geometric progression:** Each coarser LOD level doubles the distance threshold
- **Morph zones:** `morphStart = distance × 0.8` (configurable via `morphRatio`)
- **RTE precision:** Assert magnitude < 10^6 before float32 conversion

**Technical Notes:**
- Frustum planes use Hessian normal form (unit normal + signed distance)
- LOD ranges are pre-computed on resize/FOV change, not per-frame
- Tree modification (subdivide/collapse) happens during selection traversal
- NodeData layout matches WGSL struct for direct GPU upload

**Verification:** All 101 unit tests pass. TypeScript compiles cleanly.

---

## Upcoming

### M10: Debug Visualization (Next)
- Wireframe rendering mode for quadtree patches
- Color-coded by LOD level (0=red → 12=violet)
- Node count overlay with per-level histogram
- Tweakpane controls: freezeLOD, forceMaxLOD, wireframeMode, showNodeBounds

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
