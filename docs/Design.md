# LunaVis Design

High-level design decisions and rationale.

## Design Philosophy

- **Rapid prototyping** — Ship working milestones quickly, refine later
- **Fail fast** — Assertions and clear errors over silent failures
- **Typeful** — Leverage TypeScript's type system for correctness
- **Modular** — Clean interfaces, but not over-engineered
- **Reactive** — Render only when needed (dirty-flag pattern)

## API Design

**Goal:** Three.js-style ergonomics over raw WebGPU verbosity.

```typescript
const viewer = new Viewer({ canvas });
await viewer.init();

const scene = new Scene();
const camera = new Camera({ fov: Math.PI / 4 });
const mesh = new Mesh(geometry, material);

viewer.setScene(scene);
viewer.setCamera(camera);
viewer.addMesh(mesh);
```

Users work with semantic objects (Scene, Mesh, Camera), not GPU resources directly.

## Architecture Decisions

### Scene Graph

**Decision:** Minimal scene graph with `Object3D` base class.

**Rationale:** Transforms and parent/child relationships are fundamental. A flat list of meshes would complicate multi-part models. Full entity-component-system is overkill for a viewer.

### Camera Model

**Decision:** Position/target/up (lookAt style) rather than Euler rotation.

**Rationale:** More intuitive for orbit controls. Computing view matrix from Euler angles proved error-prone; `mat4.lookAt()` is reliable and well-understood.

### Bind Group Strategy

**Decision:** Three bind groups with explicit layouts.

| Group | Scope | Update Frequency |
|-------|-------|------------------|
| 0 | Global (camera + light) | Once per frame |
| 1 | Material | When material changes |
| 2 | Model (per-mesh) | Per draw call |

**Rationale:** Matches WebGPU best practices—minimize bind group switches by grouping uniforms by update frequency. Explicit layouts (not `layout: 'auto'`) allow sharing between pipelines.

### Rendering Approach

**Decision:** Forward rendering with single directional light (Phase 1-3).

**Rationale:** Simplest path to visible results. Deferred rendering and multiple lights are future work. Compute-based shadows (the "hybrid" in the original plan) are Phase 4+.

### Reactive Rendering

**Decision:** Dirty-flag pattern instead of continuous `requestAnimationFrame`.

```typescript
requestRender() {
  this.dirty = true;
  if (this.frameId === null) {
    this.frameId = requestAnimationFrame(() => this.renderLoop());
  }
}
```

**Rationale:** Power efficiency—no GPU work when scene is static. Multiple `requestRender()` calls coalesce into one frame.

## Error Handling

**Decision:** Throw on fatal errors, warn on recoverable issues.

- **Fatal:** WebGPU not supported, device lost, missing resources → throw Error
- **Recoverable:** Empty scene, uninitialized mesh → console.warn + skip

**Rationale:** During development, loud failures surface bugs quickly. Production hardening can come later.

## Type System

**Decision:** Branded types for IDs, `Result<T,E>` for fallible operations.

```typescript
type MeshId = string & { readonly __brand: 'MeshId' };
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

**Rationale:** Prevents mixing up IDs of different entity types. Result type makes error handling explicit without exceptions.

## Coordinate System

**Decision:** Right-handed, Y-up coordinates throughout.

```
       +Y (up)
        │
        │
        └───────── +X (right)
       /
     +Z (toward viewer)
```

**Rationale:** Matches glTF specification exactly, so no coordinate conversion needed when loading models. This is the most common convention in 3D graphics (used by OpenGL, Blender export default, etc.).

**Implications:**
- Camera default position: `(0, 0, +dist)` looking at origin
- Model "front" faces +Z (toward camera)
- Light "from above": direction = `(0, -1, 0)` (points *toward* surfaces)
- WebGPU clip space Z range is [0, 1] (not [-1, 1] like OpenGL), handled by `wgpu-matrix` projection

## Browser Support

**Decision:** WebGPU required, no fallback.

**Rationale:** This is a WebGPU learning project. WebGL fallback would double the codebase complexity. Target audience has modern browsers.

**Primary:** Firefox (with `dom.webgpu.enabled`)
**Secondary:** Chrome/Edge (Intel Arc driver issues on Linux hybrid GPUs)

## Performance Targets

**Decision:** Design for 50K+ triangles, defer acceleration structures.

**Rationale:** Simple brute-force rendering is fast enough for most glTF models. BVH/spatial structures are needed for compute shadows (Phase 4+), not basic rendering.

## CDLOD Terrain System

> **See also:** [CDLOD Design Doc.md](CDLOD%20Design%20Doc.md) for the full technical specification including GPU vertex shader, heightmap sampling, geomorphing, and Hapke BRDF details.
>
> **TODO:** Incorporate the CDLOD Design Doc into this main design document once the implementation is complete (after M19).

### Spherified Cube Geometry

**Decision:** Represent the Moon as a spherified cube (6 quad faces projected onto a sphere).

**Rationale:** A spherified cube avoids polar singularities that plague latitude/longitude grids. Each face has uniform sampling density, and the quadtree subdivision maps naturally to the cube structure.

### Quadtree Subdivision

**Decision:** Lazy subdivision with object references (not pre-allocated flat array).

**Rationale:** Nodes are created on demand during LOD selection and collapsed when no longer needed. This keeps memory proportional to visible detail. Object references make debugging easier than index arithmetic.

### Double Precision for Node Bounds

**Decision:** Store quadtree node positions using `Float64Array`.

**Rationale:** At LOD 12+, patch sizes become ~0.00024 in UV space. Single-precision float32 would introduce visible jitter in bounding sphere calculations. Double precision maintains accuracy for the full 15-level depth.

### Unit Sphere Coordinates

**Decision:** Quadtree operates on unit sphere (radius=1), renderer applies planet radius.

**Rationale:** Keeps the terrain system generic. The same quadtree code works for any celestial body by changing the radius uniform.

### LOD Selection Strategy

**Decision:** Screen-space error metric with pre-computed distance thresholds.

```typescript
// At init/resize: compute LOD ranges from pixel error budget
fitParam = screenHeight / (2 * tan(fov / 2))
finestRange = (finestNodeSize * fitParam) / maxPixelError

// At runtime: simple distance comparison
for (lod = 0; lod <= maxLod; lod++) {
  ranges[lod] = finestRange * 2^(maxLod - lod)
}
```

**Rationale:** Hybrid approach — combines CDLOD's predictable per-frame behavior with automatic adaptation to screen resolution and FOV. The `maxPixelError` parameter (default: 4 pixels) is intuitive: "how much geometric popping am I willing to tolerate?"

### Morph Zone Calculation

**Decision:** Morph zone covers 20% of each LOD level's range (morphStart = distance × 0.8).

**Rationale:** Provides smooth transition without excessive blending overhead. Smaller zones (10%) cause visible popping; larger zones (30%+) waste GPU time on unnecessary blending.

### Relative-to-Eye (RTE) Coordinates

**Decision:** Compute camera-relative positions on CPU, pass to GPU as float32.

```typescript
rtePosition = nodeSphereCenter - cameraPosition  // Double precision
// Then cast to float32 for GPU upload
```

**Rationale:** Planetary scales exceed float32 precision. By subtracting camera position on CPU (double precision), the resulting RTE vector is small enough for float32 without jitter. Assertion validates magnitude < 10^6.

### Cube Face Mapping

**Decision:** Match right-handed Y-up coordinate system used throughout the codebase.

```
Face 0 (+Z): front (toward viewer)
Face 1 (-Z): back
Face 2 (+X): right
Face 3 (-X): left
Face 4 (+Y): top
Face 5 (-Y): bottom
```

**Rationale:** Consistent with glTF and existing camera/scene conventions. No coordinate conversion needed.

### Debug Visualization (M10)

**Decision:** Use an exclusive debug render mode with a frozen camera.

**Rationale:** The debug view is intended for CDLOD inspection, not scene composition. Replacing the normal model render avoids depth conflicts, and freezing the camera at toggle time makes LOD transitions reproducible for inspection.

**Debug UI:** Tweakpane controls enable/disable, freeze LOD, force max LOD, wireframe toggle, bounds toggle, max pixel error, and max LOD level. A lightweight DOM overlay shows node counts and per-level histogram.

## glTF Loading (M5)

### Loader Library

**Decision:** Use `@loaders.gl/gltf` rather than custom parser or three.js loader.

**Rationale:** loaders.gl provides typed accessor unpacking, handles binary GLB format, and integrates well with TypeScript. Lighter weight than three.js for our needs.

### Auto-Framing

**Decision:** Automatically position camera based on model bounding box.

**Rationale:** Models vary wildly in scale. Computing bounds and positioning camera at 2.5× model size ensures any model is visible without manual adjustment.

### Flat Normal Generation

**Decision:** Generate flat (faceted) normals when NORMAL attribute is missing.

**Rationale:** Many glTF models omit normals. Flat normals from cross product of triangle edges provide acceptable shading rather than failing to load.

### Camera-Following Light

**Decision:** Light direction computed relative to camera (upper-left shoulder).

**Rationale:** Provides consistent illumination as user orbits. Direction = `-right*0.4 + up*0.4 + view*0.8` gives natural "over the shoulder" lighting.

## Textured Materials (M7)

### Specular Intensity Control

**Decision:** Add `specularIntensity` uniform (0-1) to control specular contribution.

**Rationale:** Lunar regolith is purely diffuse — setting `specularIntensity: 0` disables specular without changing the shader. More flexible than separate shader variants.

### UV Coordinates

**Decision:** Optional UV support in Geometry class, extracted from `TEXCOORD_0`.

**Rationale:** Not all models have textures. Optional UVs keep the solid-color path simple while enabling textured rendering when available.

### Texture Loading Pipeline

**Decision:** GLTFLoader creates GPU textures directly when device is provided.

**Rationale:** Centralizes texture creation in the loader. Images are loaded via loaders.gl, then converted to GPUTexture with mipmaps. Avoids passing raw images around.

## Future Considerations

These decisions may need revisiting:

- **Multiple materials per mesh** — Currently 1:1. glTF models often have submeshes.
- **Instanced rendering** — Not implemented. Would help with repeated geometry.
