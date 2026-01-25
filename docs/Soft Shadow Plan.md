Based on the sources, particularly the new documentation on **"Soft Shadow Hybrid Rendering via WebGPU Compute Shaders"** 1, this approach fits **extremely well** with your current pipeline. In fact, it is the recommended "state-of-the-art" solution for environments like WebGPU that lack hardware-accelerated ray tracing (DXR/Vulkan RT).  
Here is the breakdown of how to integrate raytraced soft shadows into your Quad-Sphere \+ CDLOD system:

### 1\. How well does it fit?

**Ideally.**Your CDLOD system generates a massive number of micropolygons to handle LOD. Raytracing against this explicit triangle geometry in a Compute Shader (without hardware acceleration like BVH) would be prohibitively slow and complex to implement in WGSL 1\.

* **The Hybrid Solution:** Instead of tracing geometry, you perform **Hybrid Rendering**. You rely on your existing rasterizer to solve primary visibility (which CDLOD is good at) and generate a **G-Buffer** (Depth/Position \+ Normal).  
* **Compute Shader Role:** You then launch a Compute Shader to calculate shadows by shooting rays from the surface positions stored in the G-Buffer 2\.

### 2\. Can I trace against an analytically calculated SDF?

**Yes, and you should.**Tracing against the **Analytic Surface Function** (Sphere \+ Heightfield) is significantly faster and robust than tracing the mesh. You essentially treat your planet as a mathematical volume rather than a collection of triangles.

#### The "Quasi-SDF" Strategy

You proposed an "analytically calculated SDF." For a planet with a heightfield $h(u,v)$, the exact Signed Distance Field is hard to compute analytically because it requires the distance to the *nearest* point on the terrain (which might be sideways on a cliff). However, you can use a **Radial Distance Approximation** which works perfectly for **Sphere Tracing** 3:

* **The Function:** Define the signed distance $d(P)$ at any point $P$ in space as:$$d(P) \\approx ||P|| \- (R\_{planet} \+ h(\\text{project}(P)))$$  
* $||P||$: Distance from planet center.  
* $project(P)$: The UV coordinates of $P$ projected onto the sphere.  
* $h(...)$: Sample the heightmap.  
* **Ray Marching:** In your Compute Shader, you march along the shadow ray. At each step, you evaluate $d(P)$.  
* If $d(P) \< \\epsilon$: Intersection (Shadow).  
* If $d(P) \> 0$: Step forward by $d(P)$.  
* \*\* Lipschitz Correction:\*\* Because terrain has slopes, stepping by the full radial difference might overshoot and clip through a mountain. You must multiply the step size by a factor related to the maximum slope of your terrain (e.g., $0.5$) or use a pre-computed **Min/Max Mipmap** (accelerated ray marching) to safely skip empty space 3, 4\.

### 3\. Implementing the "Soft" Shadow

To get physically accurate soft shadows (penumbras) for the Sun without shooting hundreds of rays, the sources recommend a **Stochastic 1-Sample-Per-Pixel (1-SPP)** approach 1, 5:

* **Light Source:** Model the Sun as an **Area Light** (Disk) with an angular diameter of $\\approx 0.533^{\\circ}$ 6\.  
* **Stochastic Sampling:** For every pixel, do not shoot the shadow ray directly at the Sun's center. Instead, select a random point on the Sun's disk.  
* **Cone Distribution:** Generate a ray direction within the cone defined by the Sun's angular size 5\.  
* **Blue Noise:** Use a **Blue Noise** texture to jitter this direction. Blue noise distributes samples such that the resulting error looks like high-frequency static rather than low-frequency clumps, making it much easier to denoise 5\.  
* **Trace:** March this single jittered ray against your "Analytic SDF" heightfield. Output 0.0 (shadow) or 1.0 (lit).

### 4\. Denoising (Crucial Step)

The raw output of a 1-SPP pass will look like noisy sand. You must apply **Denoising** to smooth it into a high-quality soft shadow 7:

* **Temporal Accumulation:** In your shader, reproject the pixel's position to the previous frame. Read the previous frame's shadow result and blend it with the current (noisy) result. This effectively integrates samples over time, smoothing out the jitter 7\.  
* **Spatial Filter:** Apply a blur (e.g., Bilateral Filter) that respects depth and normal edges. This smears the noise out into a smooth gradient while keeping shadow edges (like those cast by craters) sharp where they contact the ground 7\.

### Summary Pipeline for WGSL

* **Vertex/Fragment (CDLOD):** Render Terrain to G-Buffer (WorldPos, Normal).  
* **Compute Shader (Shadows):**  
* Read WorldPos.  
* Generate random direction to Sun (Blue Noise) 5\.  
* **Sphere Trace** against length(P) \- (R \+ texture(Height, uv)) 3\.  
* Write 0 or 1 to ShadowTexture.  
* **Compute Shader (Denoise):**  
* Blend ShadowTexture with HistoryTexture (Temporal) 7\.  
* Blur result (Spatial).  
* **Fragment (Lighting):** Use the denoised value to modulate the sun intensity.

