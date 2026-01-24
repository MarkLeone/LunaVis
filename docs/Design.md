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

## Future Considerations

These decisions may need revisiting:

- **Multiple materials per mesh** — Currently 1:1. glTF models often have submeshes.
- **Instanced rendering** — Not implemented. Would help with repeated geometry.
- **Texture support** — Currently solid colors only. Diffuse/normal maps planned.
- **Multiple lights** — Single directional light. Point lights, spotlights deferred.
