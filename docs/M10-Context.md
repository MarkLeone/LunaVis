# M10 Debug Visualization Context

## Summary
The CDLOD debug renderer work is partially implemented. The system now has a `DebugRenderer` that can render wireframe patches and (planned) bounding spheres, and the `Viewer` supports a render override for exclusive debug rendering. The remaining work is to add the bounds shader, update shaders to the new data layout, and wire the debug mode + overlay into `main.ts`.

## Code Changes Already Made
- Added render override support:
  - `src/core/Viewer.ts`: `setRenderOverride()` and render loop uses it when set.
- Updated debug renderer data + rendering:
  - `src/terrain/DebugRenderer.ts` now packs `uvOrigin`, `scale`, `lodLevel`, `faceId`, `radius`.
  - Added bounds pipeline and unit-sphere wireframe mesh generation in `DebugRenderer`.
  - Added node count cap to `MAX_NODES` with a one-time warning.

## Current Gaps
- `src/shaders/debug-bounds.wgsl` does not exist yet.
- `src/shaders/debug-wireframe.wgsl` still references the old NodeData layout and needs to be aligned with the new packed fields.
- `src/main.ts` has no terrain debug toggle, no render override wiring, and no DOM overlay.

## Confirmed Requirements
- Debug rendering is exclusive (replaces normal model render).
- Debug mode only active when a `Terrain Debug` toggle is enabled.
- Use a lightweight DOM overlay (similar to stats.js placement) for node counts.
- Use a fixed debug camera captured at the time the toggle is enabled (do not track live OrbitControls updates).

## Open Questions
- None.

## Next Steps
1. Add `src/shaders/debug-bounds.wgsl` for bounding sphere rendering.
2. Update `src/shaders/debug-wireframe.wgsl` to match new NodeData layout.
3. Wire `DebugRenderer` into `src/main.ts` with a `Terrain Debug` toggle.
4. Implement fixed debug camera capture on toggle enable.
5. Add/remove a DOM overlay for LOD stats while debug mode is enabled.
6. Manual browser verification of wireframe, LOD colors, bounds, and overlay.
