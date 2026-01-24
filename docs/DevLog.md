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

## Upcoming

### M2: Triangle Rendering (Next)
- `Geometry` class with GPU buffer management
- `SolidMaterial` class with render pipeline
- `Mesh` class linking geometry + material
- `Renderer.render()` command encoding
- `createTriangle()` primitive

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
