Based on the sources, particularly the new documentation on **"Soft Shadow Hybrid Rendering via WebGPU Compute Shaders"** 1, this approach fits **extremely well** with your current pipeline. In fact, it is the recommended "state-of-the-art" solution for environments like WebGPU that lack hardware-accelerated ray tracing (DXR/Vulkan RT).
Here is the breakdown of how to integrate raytraced soft shadows into your Quad-Sphere + CDLOD system:

### 1. How well does it fit?

**Ideally.** Your CDLOD system generates a massive number of micropolygons to handle LOD. Raytracing against this explicit triangle geometry in a Compute Shader (without hardware acceleration like BVH) would be prohibitively slow and complex to implement in WGSL 1.

* **The Hybrid Solution:** Instead of tracing geometry, you perform **Hybrid Rendering**. You rely on your existing rasterizer to solve primary visibility (which CDLOD is good at) and generate a **G-Buffer** (Depth/Position + Normal).
* **Compute Shader Role:** You then launch a Compute Shader to calculate shadows by shooting rays from the surface positions stored in the G-Buffer 2.

### 2. Can I trace against an analytically calculated SDF?

**Yes, and you should.** Tracing against the **Analytic Surface Function** (Sphere + Heightfield) is significantly faster and robust than tracing the mesh. You essentially treat your planet as a mathematical volume rather than a collection of triangles.

#### The "Quasi-SDF" Strategy

You proposed an "analytically calculated SDF." For a planet with a heightfield $h(u,v)$, the exact Signed Distance Field is hard to compute analytically because it requires the distance to the *nearest* point on the terrain (which might be sideways on a cliff). However, you can use a **Radial Distance Approximation** which works perfectly for **Sphere Tracing** 3:

* **The Function:** Define the signed distance $d(P)$ at any point $P$ in space as:
  $$d(P) \approx ||P|| - (R_{planet} + h(\text{project}(P)))$$
* $||P||$: Distance from planet center.
* $project(P)$: The UV coordinates of $P$ projected onto the sphere.
* $h(...)$: Sample the heightmap.
* **Ray Marching:** In your Compute Shader, you march along the shadow ray. At each step, you evaluate $d(P)$.
* If $d(P) < \epsilon$: Intersection (Shadow).
* If $d(P) > 0$: Step forward by $d(P)$.
* **Lipschitz Correction:** Because terrain has slopes, stepping by the full radial difference might overshoot and clip through a mountain. You must multiply the step size by a factor related to the maximum slope of your terrain (e.g., $0.5$) or use a pre-computed **Min/Max Mipmap** (accelerated ray marching) to safely skip empty space 3, 4.

### 3. Implementing the "Soft" Shadow

To get physically accurate soft shadows (penumbras) for the Sun without shooting hundreds of rays, the sources recommend a **Stochastic 1-Sample-Per-Pixel (1-SPP)** approach 1, 5:

* **Light Source:** Model the Sun as an **Area Light** (Disk) with an angular diameter of $\\approx 0.533^{\\circ}$ 6.
* **Stochastic Sampling:** For every pixel, do not shoot the shadow ray directly at the Sun's center. Instead, select a random point on the Sun's disk.
* **Cone Distribution:** Generate a ray direction within the cone defined by the Sun's angular size 5.
* **Blue Noise:** Use a **Blue Noise** texture to jitter this direction. Blue noise distributes samples such that the resulting error looks like high-frequency static rather than low-frequency clumps, making it much easier to denoise 5.
* **Trace:** March this single jittered ray against your "Analytic SDF" heightfield. Output 0.0 (shadow) or 1.0 (lit).

### 4. Denoising (Crucial Step)

The raw output of a 1-SPP pass will look like noisy sand. You must apply **Denoising** to smooth it into a high-quality soft shadow 7:

* **Temporal Accumulation:** In your shader, reproject the pixel's position to the previous frame. Read the previous frame's shadow result and blend it with the current (noisy) result. This effectively integrates samples over time, smoothing out the jitter 7.
* **Spatial Filter:** Apply a blur (e.g., Bilateral Filter) that respects depth and normal edges. This smears the noise out into a smooth gradient while keeping shadow edges (like those cast by craters) sharp where they contact the ground 7.

### Summary Pipeline for WGSL

* **Vertex/Fragment (CDLOD):** Render Terrain to G-Buffer (WorldPos, Normal).
* **Compute Shader (Shadows):**
  * Read WorldPos.
  * Generate random direction to Sun (Blue Noise) 5.
  * **Sphere Trace** against `length(P) - (R + texture(Height, uv))` 3.
  * Write 0 or 1 to ShadowTexture.
* **Compute Shader (Denoise):**
  * Blend ShadowTexture with HistoryTexture (Temporal) 7.
  * Blur result (Spatial).
* **Fragment (Lighting):** Use the denoised value to modulate the sun intensity.

---

# Appendix: Detailed Implementation Plan

This appendix translates the soft-shadow approach into concrete, repo-aligned steps based on the current project plan, design decisions, and implementation constraints.

## A. Goals and Non-Goals

**Goals**
- Soft shadows for the lunar terrain using compute shaders.
- Hybrid pipeline: rasterized primary visibility + compute shadowing.
- Minimal divergence from the current bind group strategy (explicit layouts, 3 groups).
- Integrates with CDLOD terrain rendering (M8+), preserves reactive rendering.

**Non-Goals (for initial rollout)**
- Triangle-based ray tracing against CDLOD meshes.
- Multi-light support; directional Sun only.
- High-quality denoiser beyond a basic temporal + edge-aware spatial filter.

## B. Pipeline Overview (Frame Flow)

1. **Terrain G-Buffer Pass (Raster)**
   - Output: world position, world normal, depth.
   - Implemented as a dedicated render pipeline or a debug override pipeline.

2. **Shadow Compute Pass**
   - Input: world position, normal, sun direction, heightmap.
   - Output: raw shadow factor (0/1) to a storage texture (R8 or R16).

3. **Denoise Compute Pass**
   - Temporal accumulation with history buffer.
   - Spatial edge-aware filter using position/normal/depth.
   - Output: denoised shadow texture (sampling format).

4. **Lighting Pass (Raster)**
   - Use denoised shadow factor to modulate sunlight term.
   - Final color written to swapchain.

All passes are executed in a single command encoder, ordered to ensure correct dependencies.

## C. Data & Resource Plan

### C1. Textures

- **G-Buffer Position**
  - Format: `rgba16float` (XYZ world position + padding).
  - Usage: `RENDER_ATTACHMENT | TEXTURE_BINDING`.
- **G-Buffer Normal**
  - Format: `rgba16float` (XYZ world normal + padding).
  - Usage: `RENDER_ATTACHMENT | TEXTURE_BINDING`.
- **G-Buffer Depth**
  - Format: `depth24plus`.
  - Usage: `RENDER_ATTACHMENT | TEXTURE_BINDING` (if supported) or use a depth buffer plus a linear depth texture.
- **Shadow Raw**
  - Format: `r8unorm` (raw 0/1) or `r16float` (if needed for filtering).
  - Usage: `STORAGE_BINDING | TEXTURE_BINDING`.
- **Shadow History**
  - Format: `r16float`.
  - Usage: `STORAGE_BINDING | TEXTURE_BINDING`.
- **Shadow Denoised**
  - Format: `r16float`.
  - Usage: `STORAGE_BINDING | TEXTURE_BINDING`.

### C2. Buffers and Uniforms

Extend the existing **Global Uniforms (Group 0)** with shadow-related values:
- `sunDirection: vec3<f32>` (already exists as lightDirection).
- `sunAngularRadius: f32` (approx 0.2665 degrees in radians).
- `planetRadius: f32`.
- `shadowStepScale: f32` (Lipschitz safety scale, e.g., 0.5).
- `frameIndex: u32` (for noise and temporal reprojection).
- `shadowHistoryWeight: f32` (temporal blend factor).
- `shadowNormalThreshold: f32` (edge-aware filter control).
- `shadowDepthThreshold: f32` (edge-aware filter control).

Use explicit padding to preserve 16-byte alignment.

### C3. Noise

- Add a small blue-noise texture (e.g., 256x256 `r8unorm`).
- Bind as `texture_2d<f32>` in the shadow compute pass.
- Index via screen-space coordinates + `frameIndex` modulation.

## D. Shader Plan

### D1. Terrain G-Buffer Shader

Create a new shader (or variant) to output:
- World position (from vertex transform).
- World normal (normalize in fragment).

The pipeline should mirror existing terrain shaders to avoid changing geometry logic.

### D2. Shadow Compute Shader (Sphere Tracing)

Core steps per pixel:
1. Load world position and normal from G-buffer.
2. Early out if position is invalid or depth is 1.0 (sky).
3. Generate stochastic ray direction toward the Sun:
   - Use blue noise to sample a point on a disk.
   - Convert disk sample to a cone direction around `sunDirection`.
4. Ray march using radial distance approximation:
   - `d(P) = length(P) - (planetRadius + height(uv(P)))`
   - Step: `t += d(P) * shadowStepScale`
   - Hit when `d(P) < epsilon`, miss when `t > maxDistance`.
5. Write `0.0` (shadow) or `1.0` (lit) to Shadow Raw.

### D3. Denoise Compute Shader

**Temporal pass**
- Reproject previous frame using camera matrices:
  - Cache previous `viewProjection` in a small uniform buffer.
  - Compute last frame UV for each pixel and sample `ShadowHistory`.
- Blend: `shadow = mix(current, history, historyWeight)`.

**Spatial pass**
- Bilateral filter in a small radius (e.g., 5x5).
- Weight by depth/normal similarity to preserve edges.
- Output to Shadow Denoised.

## E. Engine Integration Plan

### E1. Renderer Changes

Add a multi-pass render sequence in `Renderer.render()` (or equivalent):
1. G-buffer render pass (terrain only).
2. Shadow compute pass.
3. Denoise compute pass.
4. Main lighting pass (terrain + any meshes).

All passes should use explicit bind group layouts to align with the Design and Implementation docs.

### E2. Bind Group Layouts

Keep the existing 3-group strategy:
- **Group 0 (Global):** camera, light, shadow params.
- **Group 1 (Material):** unchanged.
- **Group 2 (Object):** unchanged.

Add a **Compute Group 3** for shadow-specific resources:
- G-buffer textures (position/normal/depth).
- Heightmap texture + sampler.
- Blue noise texture + sampler.
- Shadow raw/history/denoised textures.

### E3. Render Overrides

During development, use a render override to visualize:
- G-buffer position/normal.
- Shadow raw (noise).
- Shadow denoised.

This follows the existing DebugRenderer pattern and keeps the main pipeline stable.

## F. Implementation Steps (Milestone-Level)

### F1. G-Buffer Pass (Foundational)
- Add `terrain-gbuffer.wgsl`.
- Add `GBufferRenderer` or expand `TerrainRenderer` with a G-buffer mode.
- Create G-buffer textures on resize.
- Validate by displaying position/normal in a debug pass.

**Acceptance**
- Position buffer encodes world position correctly.
- Normal buffer normalized and stable across LODs.

### F2. Shadow Compute Pass (Raw)
- Add `shadows-raymarch.wgsl`.
- Bind G-buffer position + heightmap.
- Implement basic sphere tracing with a fixed sun direction (no noise yet).

**Acceptance**
- Hard shadow edge visible and consistent.
- Shadowing respects terrain occlusion.

### F3. Soft Shadow Sampling
- Add blue noise texture.
- Sample a random point on sun disk per pixel.
- Add `frameIndex` to noise lookup for temporal variation.

**Acceptance**
- Penumbra appears but noisy.

### F4. Denoise (Temporal + Spatial)
- Add history buffers (ping-pong).
- Implement reprojection using previous `viewProjection`.
- Add bilateral spatial filter.

**Acceptance**
- Noise reduces over several frames.
- Edges remain sharp at shadow boundaries.

### F5. Integrate with Lighting Pass
- Update terrain lighting shader to sample `shadowDenoised`.
- Modulate only the sun term, keep ambient unaffected.

**Acceptance**
- Soft shadows visible in final shading.
- No regression in ambient lighting.

## G. Testing & Verification

- **Unit tests:** math helpers for noise sampling, cone direction generation.
- **Visual tests:** debug toggles for each texture target.
- **Performance checks:** log compute pass time and frame time.
- **Regression:** ensure reactive rendering still coalesces frames (no continuous RAF).

## H. Risks & Mitigations

- **Ray marching artifacts:** Use conservative step scaling, clamp max steps.
- **Temporal smear:** Reset history on camera jumps or LOD major changes.
- **Edge bleeding:** Tune normal/depth thresholds; reduce filter radius.
- **Performance:** Start with half-resolution shadow textures if needed.
