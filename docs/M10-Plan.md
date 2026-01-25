# M10 Debug Visualization Plan

## Goal
Add a toggleable, exclusive debug rendering mode for the CDLOD quadtree. When enabled, the regular model render is replaced by a wireframe terrain visualization with LOD color-coding and an on-screen node count overlay. LOD selection uses a fixed debug camera captured when the toggle is enabled.

## Scope
- Wireframe patches color-coded by LOD.
- Optional bounding sphere rendering for selected nodes.
- Lightweight DOM overlay for node counts + per-level histogram.
- Tweakpane controls to toggle and configure debug view.
- Console logging of LOD distribution (already in DebugRenderer).

## Current State (already implemented or in progress)
- `src/terrain/DebugRenderer.ts` exists and renders wireframe patches.
- `src/shaders/debug-wireframe.wgsl` exists.
- `src/terrain/DebugGridMesh.ts` exists.
- `src/core/Viewer.ts` updated with `setRenderOverride()` to support exclusive debug rendering.
- `src/terrain/DebugRenderer.ts` updated to:
  - include bounding sphere rendering pipeline (new shader `debug-bounds.wgsl` pending).
  - pack UV origin + radius into node buffer.
  - cap node count to `MAX_NODES` with a one-time warning.

## Implementation Plan

### 1) Debug pipeline + shader finalization
- Add new shader `src/shaders/debug-bounds.wgsl`:
  - Vertex input: unit-sphere wireframe vertices.
  - Instance data: `DebugNodeData` (uvOrigin, scale, faceId, radius).
  - Convert face UV center to sphere center using `uvToCubeDir()`.
  - Scale by `radius` and offset by center.
  - Output a neutral color (e.g., gray) or match LOD color.
- Ensure `debug-wireframe.wgsl` NodeData layout matches the new packing:
  - `uvOrigin` (vec2), pad, `scale`, `lodLevel`, `faceId`, `radius`, pad.

### 2) Terrain debug toggle + fixed camera
- Add a `Terrain Debug` folder in Tweakpane:
  - `enabled` (master toggle)
  - `freezeLOD`, `forceMaxLOD`, `wireframeMode`, `showNodeBounds`
  - `maxPixelError`, `maxLodLevel`
- On toggle ON:
  - Capture current camera position/target/FOV and store as debug camera.
  - Disable OrbitControls updates (or ignore control events) for terrain debug.
  - Install `viewer.setRenderOverride()` to render debug only.
- On toggle OFF:
  - Restore standard mesh rendering and UI behavior.

### 3) Node selection + render loop wiring
- Each render:
  - If debug enabled, call `DebugRenderer.selectNodes()` using:
    - captured debug camera position
    - `viewProjectionMatrix` computed from captured camera
    - `viewer.pixelSize.height` and captured FOV
  - Call `DebugRenderer.render()` in the render override.
- Ensure resize updates LOD ranges with new screen height.

### 4) DOM overlay for stats
- Create a small DOM element similar to stats.js:
  - total nodes selected
  - nodes visited / culled
  - per-level histogram (e.g., `L0: 6 L1: 12 ...`)
- Update overlay after `selectNodes()`.
- Show only when debug enabled.

### 5) Acceptance checks
- Toggle replaces normal render with wireframe terrain.
- LOD colors update correctly with distance.
- Freeze LOD stops updates.
- Bounding spheres draw when enabled.
- Overlay shows accurate node counts.

## Open Questions
- None. User preference confirmed:
  - Exclusive debug rendering.
  - Enabled via toggle only.
  - DOM overlay for stats.
  - Fixed debug camera captured at toggle time.

## Next Steps
1. Add `src/shaders/debug-bounds.wgsl` and align its NodeData struct.
2. Update `src/shaders/debug-wireframe.wgsl` to use the new NodeData layout (radius field).
3. Wire `DebugRenderer` into `src/main.ts` with toggle + overlay.
4. Add DOM overlay element + update logic.
5. Manual verification in browser.
