Here is a design for a CDLOD (Continuous Distance-Dependent Level of Detail) implementation on a quad-sphere using WebGPU and WGSL. This design prioritizes floating-point stability via CPU-side double precision and eliminates popping artifacts using vertex geomorphing.  
1\. High-Level Architecture  
The system uses a **Quad-Tree** structure where the root nodes represent the six faces of a cube. This "Spherified Cube" approach allows for efficient grid-based logic while minimizing distortion compared to UV spheres.  
**Pipeline Flow:**  
1\. **CPU (Double Precision):** Traverses the quadtree, performs frustum culling, calculates LOD metrics, and computes "Relative-to-Eye" (RTE) positions to solve precision jitter.  
2\. **GPU (Vertex Shader):** Receives a list of visible node parameters. It instantiates a shared, static grid mesh for every node, morphs the geometry to prevent cracks, samples the heightmap, and projects the result onto the sphere.  
\--------------------------------------------------------------------------------  
2\. CPU: Selection & Precision (Double Precision)  
WebGPU shaders (WGSL) primarily operate on 32-bit floats. To render a planetary scale without "jitter," we must handle the large world coordinates on the CPU using 64-bit doubles.  
**The Selection Loop:** For each of the 6 cube faces, recursively traverse the quadtree:  
1\. **LOD Criteria:** Calculate the distance from the camera to the node's bounding sphere. If the distance is less than a pre-calculated threshold for the current LOD level (ranges\[LOD\]), split the node (unless we are at maximum depth).  
2\. **Frustum Culling:** Check if the node's AABB (or bounding sphere) intersects the camera frustum. Discard if outside.  
3\. **RTE Calculation:** If a node is selected for rendering (a leaf in the current view), calculate its center relative to the camera: Prelative​=Pworld\_node​−Pworld\_camera​ This resulting vector is small enough to be cast to `float32` and sent to the GPU without precision loss.  
**Output to GPU:** Upload a `StorageBuffer` containing a struct for every visible node:  
struct NodeData {  
    vec3  relativeOrigin; // RTE Position (float32)  
    float scale;          // Size of the node in cube-space  
    int   lodLevel;       // 0 to MaxLOD  
    int   faceID;         // 0..5 (Front, Back, Left, Right, Top, Bottom)  
    vec2  morphConsts;    // Precomputed morph ranges for this LOD  
};

\--------------------------------------------------------------------------------  
3\. GPU Resources  
• **Geometry:** A single static `Vertex Buffer` representing a flat N×N grid (e.g., 32×32). This mesh is instanced for every visible node.  
• **Heightmap:** A high-resolution texture array (or Cubemap) with pre-generated **Mipmaps**. Mipmaps are critical for preventing aliasing in the vertex shader when sampling the displacement map for distant LODs.  
\--------------------------------------------------------------------------------  
4\. WGSL Vertex Shader Design  
The vertex shader performs three critical tasks: **Geomorphing** (to hide LOD transitions), **Cube-to-Sphere Mapping**, and **Displacement**.  
A. Geomorphing Logic  
CDLOD prevents cracks and popping by "morphing" vertices. When a node is close to the transition distance (the "morph area"), its odd-numbered vertices slowly interpolate toward the positions they would occupy in the next lower LOD (the parent node).  
Vertices in the static grid are conceptually either "even" (present in the parent LOD) or "odd" (removed in the parent LOD).  
• **Even vertices** (2i,2j) remain stationary.  
• **Odd vertices** (2i+1,2j) lerp toward the midpoint of their even neighbors.  
B. WGSL Implementation  
struct NodeData {  
    relativeOrigin: vec3\<f32\>,  
    scale: f32,  
    lodLevel: u32,  
    faceID: u32,  
    morphStart: f32, // Distance where morphing begins  
    morphEnd: f32,   // Distance where morphing ends (LOD switch)  
};

@group(0) @binding(0) var\<storage, read\> nodeData: array\<NodeData\>;  
@group(0) @binding(1) var heightMap: texture\_cube\<f32\>;  
@group(0) @binding(2) var heightSampler: sampler;  
@group(0) @binding(3) var\<uniform\> camera: CameraUniforms;

// Helper: Map cube face UV to Direction Vector (normalized later)  
fn uvToCubeDir(faceID: u32, uv: vec2\<f32\>) \-\> vec3\<f32\> {  
    // Map 0..1 UV to \-1..1 range  
    let uc \= 2.0 \* uv.x \- 1.0;  
    let vc \= 2.0 \* uv.y \- 1.0;  
      
    // Standard mapping logic (simplified for brevity)  
    switch (faceID) {  
        case 0u: { return vec3\<f32\>(uc, vc, 1.0); }  // \+Z  
        case 1u: { return vec3\<f32\>(-uc, vc, \-1.0); } // \-Z  
        case 2u: { return vec3\<f32\>(1.0, vc, \-uc); }  // \+X  
        case 3u: { return vec3\<f32\>(-1.0, vc, uc); } // \-X  
        case 4u: { return vec3\<f32\>(uc, 1.0, \-vc); }  // \+Y  
        default: { return vec3\<f32\>(uc, \-1.0, vc); } // \-Y  
    }  
}

@vertex  
fn main(  
    @builtin(instance\_index) instanceIdx: u32,   
    @location(0) gridPos: vec2\<f32\> // 0..1 coordinates from static grid buffer  
) \-\> @builtin(position) vec4\<f32\> {  
      
    let node \= nodeData\[instanceIdx\];  
      
    // 1\. Calculate World Position (Relative to Camera) on the Cube Face  
    // gridPos is 0..1 local to the patch.   
    // node.relativeOrigin is the bottom-left of the patch in camera space.  
    // However, for the math to work, we usually treat the cube as size \[-R, R\].  
    // Here we reconstruct the 2D position on the cube face.  
    let faceSize \= node.scale;  
    let localPos2D \= gridPos \* faceSize;  
      
    // 2\. Geomorphing Calculation  
    // Calculate distance from camera to this vertex (approximated or exact)  
    // Note: Since we are in RTE space, the camera is at (0,0,0).   
    // We construct a temporary 3D position on the cube to measure distance.  
    let rawCubeDir \= uvToCubeDir(node.faceID, localPos2D); // Simplified logic  
    // A robust implementation calculates the exact distance to the \*spherified\* point.  
    let dist \= length(node.relativeOrigin \+ rawCubeDir); 

    // Calculate Morph Factor (0.0 \= detail, 1.0 \= simplified/parent)  
    // Morph happens only in the transition zone \[morphStart, morphEnd\]  
    var morphLerp \= clamp((dist \- node.morphStart) / (node.morphEnd \- node.morphStart), 0.0, 1.0);  
      
    // Identify if this vertex would disappear in the parent LOD  
    // We use the fractional part of the grid dimension (assuming N is power of 2\)  
    // If the grid resolution is 32, we check if the index is odd.  
    // This requires passing the integer vertex index or using fract() logic.  
    let gridDim \= 32.0;   
    let vertexIdx \= gridPos \* gridDim;  
    let isOdd \= fract(vertexIdx \* 0.5) \* 2.0; // returns \> 0 for odd vertices  
      
    // Determine the 'morphed' 2D position.  
    // If we morph, we move to the average position of the even neighbors.  
    // In practice, this effectively snaps the grid coordinate to the nearest even index.  
    let morphedGridPos \= gridPos \- (isOdd \* (1.0 / gridDim) \* morphLerp);

    // 3\. Re-calculate Cube-Space Position with Morphed Coordinates  
    let finalLocalPos2D \= node.relativeOrigin.xy \+ (morphedGridPos \* node.scale);   
    // (Note: Implementation details vary on how relativeOrigin is packed,   
    // usually it includes the offset within the face).

    // 4\. Cube-to-Sphere Mapping  
    // Get the vector pointing from planet center to the cube surface  
    let cubeVec \= uvToCubeDir(node.faceID, finalLocalPos2D);   
    let sphereNormal \= normalize(cubeVec); // The fundamental Spherified Cube step \[2\]

    // 5\. Heightmap Sampling  
    // Use textureSampleLevel to access the specific MIP level corresponding to LOD.  
    // Using hardware derivatives (textureSample) inside a VS causes artifacts.  
    let height \= textureSampleLevel(heightMap, heightSampler, sphereNormal, f32(node.lodLevel)).r;  
      
    // 6\. Apply Displacement (RTE)  
    // Radius must be handled carefully.   
    // Position \= CameraRelativeSphereCenter \+ Normal \* (Radius \+ Height)  
    // Since CameraRelativeSphereCenter can be large, we use the RTE offset passed from CPU.  
    // A common optimization: P\_final \= P\_cube\_RTE \+ Normal \* Height  
    // But for a sphere:  
    let PlanetRadius \= 6371000.0;  
    let finalPosRTE \= sphereNormal \* (PlanetRadius \+ height) \+ node.relativeOrigin;   
    // \*Correction\*: node.relativeOrigin is usually the chunk corner.   
    // Standard RTE approach: P\_final \= (sphereNormal \* (Radius \+ Height)) \- CameraPosHighPrecision  
      
    return camera.viewProj \* vec4\<f32\>(finalPosRTE, 1.0);  
}

5\. Key Implementation Nuances  
• **Mipmap Selection:** You typically want to map the Quadtree LOD level directly to the Texture Mipmap level. If LOD 0 is your highest detail, sample Mip 0\. If you transition to LOD 1, sample Mip 1\. The `morphLerp` factor should NOT interpolate between mip levels; stick to the mip level of the *current* node to avoid "texture swimming". The geometric morphing (moving the vertex) handles the transition.  
• **Displacement & Normals:** Because the vertex shader morphs the position, the surface "flattens" as it moves away. This is desired. However, for lighting, you will need to compute normals. Since you requested not to address the fragment shader, be aware that you can compute the normal analytically in the vertex shader using the heightmap neighbors (4 taps) or rely on a derivative-based approach in the fragment shader later.  
• **The "Morph" Math:** The morph logic is vital for being crack-free. The vertex must slide along the surface of the *coarser* representation. In a standard grid, this means an "odd" vertex at index 3 slides toward index 2 (or the average of 2 and 4\) as the camera moves away. This ensures that when the LOD switches, the vertex is exactly where the parent's vertex is, making the switch invisible.

---

Based on the sources, specifically those detailing **Analytic Displacement Mapping** and GPU-based terrain rendering, you should use **Biquadratic B-Spline** interpolation rather than standard Bicubic or Bilinear sampling.  
While "Bicubic" (often implemented as Catmull-Rom) is popular for image upscaling because it preserves sharpness, **Biquadratic B-Spline** is mathematically optimal for heightfield displacement because it guarantees C1 continuity (smoothness) with lower computational cost than Bicubic (C2), ensuring your analytically reconstructed normals are stable and artifact-free.  
Here is the technical breakdown for your pipeline:  
1\. The Sampling Function: Biquadratic B-Spline  
To achieve "sharp detail" without "aliasing" or lighting artifacts, the displacement function must be smooth enough to have a continuous derivative (for normals) but cheap enough to evaluate per-pixel.  
• **Why not Bilinear?** Hardware bilinear filtering creates a C0 surface. Its first derivative (slope) is discontinuous at texel boundaries, which causes surface normals to "snap" or look faceted, destroying the illusion of detail.  
• **Why not Bicubic?** While sharper, Bicubic is more expensive to evaluate. Biquadratic B-splines provide the necessary C1 continuity (smooth lighting transitions) but are computationally cheaper to evaluate in a shader.  
• **Implementation:** You treat the heightmap texels as **B-spline control points**. For any given UV coordinate, you fetch the local **3x3 neighborhood** of texels and calculate the weighted sum using B-spline basis functions.  
2\. Data Structure: Tile Overlap (The "Ptex" Approach)  
To make this sampling "high performance" and "crack-free" on the GPU, you must avoid complex boundary logic (e.g., checking if a neighbor is in a different texture).  
• **Technique:** Store your heightfield tiles with a **1-texel overlap** (padding).  
• **Benefit:** This allows your shader to perform the 3x3 B-spline fetch anywhere inside a tile—even right at the edge—without needing to look up data from a neighboring tile or handle complex edge cases. This creates a mathematically seamless surface across tile boundaries.  
3\. Solving Aliasing: Explicit Mip-Level Selection  
"Low aliasing" requires satisfying the Nyquist limit. If you sample a high-frequency heightmap on a low-LOD mesh, the terrain will "swim" or sparkle as the camera moves.  
• **The Problem:** Hardware anisotropic filtering works for color textures but does not account for the geometric displacement of vertices.  
• **The Solution:** You must manually select the Mip Level in your shader.  
    ◦ Calculate the **Tessellation Density** (pixels per triangle edge) or the distance from the camera.  
    ◦ Select the Mip Level where one texel roughly equals the spacing between your mesh vertices.  
    ◦ **Blend Mips:** To avoid "popping" artifacts, sample the two closest Mip levels (e.g., Level 3 and Level 4\) and linearly interpolate the result based on the fractional distance. This smooths the transition of the terrain shape as you zoom in.  
4\. Maximizing Detail: Analytic Normal Reconstruction  
To get "sharp detail" from a heightmap without storing massive normal maps:  
• **Method:** Do **not** compute normals in the Vertex Shader. Compute them in the **Fragment (Pixel) Shader**.  
• **Math:** Because you are using a Biquadratic B-spline, you can analytically compute the exact partial derivatives ∂f/∂u and ∂f/∂v of the surface at the specific pixel location.  
• **Result:** This yields per-pixel lighting accuracy (crisp shadows and highlights) that matches the displacement perfectly, even if the underlying mesh geometry is lower resolution.  
Summary: The "State of the Art" Sampler  
For your WebGPU/WGSL implementation:  
1\. **Storage:** R32Float textures with 1-texel padding.  
2\. **LOD:** Calculate `mipLevel` based on camera distance (CDLOD metric).  
3\. **Fetch:** Manually sample the 3x3 texel neighborhood from `textureSampleLevel`.  
4\. **Math:** Apply **Biquadratic B-spline weights** to the samples to get Height (H) and Derivatives (dH/du,dH/dv).  
5\. **Shading:** Reconstruct the normal using the derivatives in the fragment shader.

---

1\. Does the CDLOD Vertex Shader deliver UV coordinates?  
**Technically, yes, but they require adaptation.** The CDLOD Vertex Shader design provided in the previous step calculates a `sphereNormal` vector for every vertex.  
• **If your Albedo is a Cube Map:** The `sphereNormal` vector **is** your UV coordinate (3D texture coordinate). You pass this interpolated vector to the fragment shader to sample the albedo.  
• **If your Albedo is Equirectangular (Lat/Long):** You must convert the `sphereNormal` to 2D UVs in the fragment shader using standard spherical conversion (e.g., `uv = vec2(atan2(n.z, n.x), asin(n.y))`).  
**Missing Critical Data:** To perform **Analytic Normal Reconstruction** in the fragment shader, the Vertex Shader must output the **Tangent Basis** (Tangent and Bitangent vectors) of the base sphere surface. The current `sphereNormal` is not enough to mathematically combine the sphere's curvature with the heightmap's slope.  
2\. Fragment Shader Plan  
To implement Analytic Normal Reconstruction, your Fragment Shader needs to perform the following steps:  
1\. **Input:** Receive the interpolated `sphereNormal` and `tangent` from the Vertex Shader.  
2\. **Height Gradient:** Sample the heightmap neighbors (or evaluate B-Spline derivatives) to calculate how fast the height changes (dH/du, dH/dv).  
3\. **Analytic Reconstruction:** Combine the base sphere's geometric derivatives with the heightmap's derivatives to form the true perturbed normal N.  
4\. **Albedo Shading:** Sample the albedo map using the surface coordinates and apply lighting using the reconstructed normal.  
3\. Analytic Normal Reconstruction (WGSL Implementation)  
This technique creates "crisp" lighting by calculating the exact derivative of the displaced surface function f(u,v) in the pixel shader, rather than relying on interpolated vertex normals which smooth out detail.  
Here is the WGSL Fragment Shader logic:  
// Inputs passed from Vertex Shader  
struct FragmentInput {  
    @location(0) sphereNormal: vec3\<f32\>, // Base sphere normal (normalize(position))  
    @location(1) sphereTangent: vec3\<f32\>, // Computed in VS: normalize(cross(Up, sphereNormal))  
    @location(2) uv: vec3\<f32\>,            // 3D Direction for Cube Map lookup  
};

@group(0) @binding(1) var heightMap: texture\_cube\<f32\>;  
@group(0) @binding(2) var heightSampler: sampler; // Linear sampler

fn getHeight(dir: vec3\<f32\>) \-\> f32 {  
    return textureSample(heightMap, heightSampler, dir).r;  
}

@fragment  
fn main(in: FragmentInput) \-\> @location(0) vec4\<f32\> {  
    // 1\. Reconstruct the Bitangent to form the Tangent Basis Matrix (TBN)  
    // This defines the "slope space" relative to the sphere's surface.  
    let N\_s \= normalize(in.sphereNormal);   
    let T\_s \= normalize(in.sphereTangent);  
    let B\_s \= cross(N\_s, T\_s);

    // 2\. Compute Heightfield Derivatives (The "Slope" of the terrain)  
    // We use a small epsilon to sample neighbors.   
    // Ideally, this epsilon scales with mip level/distance to avoid aliasing.  
    let eps \= 0.001;   
      
    // Finite Difference Method (Cheaper than B-Spline, accurate enough for rock)  
    // We sample height at the current point, and slightly along Tangent and Bitangent  
    let h\_val \= getHeight(in.uv);  
    let h\_u   \= getHeight(normalize(in.uv \+ T\_s \* eps));  
    let h\_v   \= getHeight(normalize(in.uv \+ B\_s \* eps));

    // Calculate partial derivatives (change in height / change in position)  
    let dH\_du \= (h\_u \- h\_val) / eps;  
    let dH\_dv \= (h\_v \- h\_val) / eps;

    // 3\. Analytic Normal Reconstruction  
    // The displaced surface function f(u,v) \= P \+ N \* h  
    // The derivative is roughly: T\_s \+ N\_s \* (slope)  
    // We construct two vectors representing the slope of the terrain in 3D space:  
    let perturbed\_T \= T\_s \+ N\_s \* dH\_du;  
    let perturbed\_B \= B\_s \+ N\_s \* dH\_dv;

    // The final normal is the cross product of these perturbed tangent vectors  
    let final\_Normal \= normalize(cross(perturbed\_T, perturbed\_B));

    // 4\. Sample Albedo & Light  
    // (See next section for Albedo filtering)  
    let albedo \= textureSample(albedoMap, albedoSampler, in.uv);  
    let lighting \= dot(final\_Normal, sunDirection);   
      
    return albedo \* lighting;  
}

**Why this works:** It mathematically combines the curvature of the sphere (Ts​,Bs​) with the high-frequency detail of the heightmap (dH), ensuring that even if the mesh is low-poly (LOD-ed out), the lighting remains perfectly sharp.  
4\. Filtering the Lunar Albedo Texture  
**Is hardware texture filtering suitable?** **Yes, but you must use Anisotropic Filtering.**  
• **Mipmapping:** Standard hardware mipmapping is required. Without it, the high-frequency craters in your lunar albedo will turn into noise (aliasing) when viewed from orbit.  
• **Anisotropic Filtering:** Because you are rendering a planet, you will frequently view the surface at extreme grazing angles (e.g., looking at the horizon). Standard trilinear filtering will blur the texture excessively in these zones. You must enable **Anisotropic Filtering** (e.g., 8x or 16x) in your WebGPU Sampler descriptor.  
**WebGPU Sampler Configuration:**  
const albedoSampler \= device.createSampler({  
  magFilter: 'linear',  
  minFilter: 'linear',  
  mipmapFilter: 'linear',  
  maxAnisotropy: 16, // CRITICAL for planetary horizons \[12\]  
  addressModeU: 'clamp-to-edge',  
  addressModeV: 'clamp-to-edge',  
});

**Note on Mipmap Generation:** For a lunar albedo, simple box-filter mipmap generation (averaging pixels) is usually sufficient. However, if you notice "fireflies" or sparkling on the horizon, the sources suggest using a filter that preserves signal energy (like geometric specular anti-aliasing) or pre-filtering the mipmaps using a Gaussian kernel to slightly blur high-frequency noise before downsampling.

---

Based on your goal of physical accuracy for lunar regolith and the specific nature of your "Hapke Normalized" color map, the most suitable BRDF is the **Hapke Model (specifically the 2012 revision)**.  
Since your color map is already "Hapke Normalized," it is not a standard diffuse texture; it essentially represents the **Single Scattering Albedo (**w**)** parameter required by the Hapke equation. Using a standard Lambertian or Oren-Nayar shader with this map would yield incorrect results because those models fail to simulate the specific way light interacts with the porous, dust-covered lunar surface.  
Why the Hapke Model?  
The lunar regolith exhibits unique optical properties that standard game-engine BRDFs (like Lambertian or PBR GGX) cannot reproduce:  
1\. **The Opposition Surge (Heiligenschein):** The moon brightens significantly when the phase angle is near zero (when the sun is directly behind the observer). This creates a "halo" around the observer's shadow.  
2\. **No Limb Darkening:** Unlike a Lambertian sphere which fades to black at the edges, the moon appears like a flat disk at full phase. The brightness is roughly consistent from the center to the edge.  
3\. **Porosity and Shadow Hiding:** The regolith is a porous volume of dust. Light penetrates and scatters inside, and micro-shadows hide or reveal themselves depending on the viewing angle.  
How to Use Your Color Map  
Your "Hapke Normalized" map has been processed to remove the effects of the sun's angle and topographic shading at the time of capture. Therefore, you must treat this texture **not as baseColor**, but as the **Single Scattering Albedo (**w**)** input for the Hapke BRDF.  
In your shader, sample the texture, convert it to linear space (if encoded), and plug it into the w variable in the equations below.  
The Hapke BRDF Specification  
Based on the sources, particularly the implementations used in scientific visualization tools like CosmoScout VR and analyses of LROC data, here is the breakdown of the BRDF parameters you should use.  
**The Equation:** The reflectance (Radiance Factor) is calculated as: r(i,e,g)=4πw​μ0​+μμ0​​\[p(g)(1+BS0​BS​(g))+M(i,e)\]  
Where:  
• i,e,g: Incidence, Emission, and Phase angles.  
• μ0​=cos(i), μ=cos(e).  
• w: **Your Color Map** (Single Scattering Albedo).  
**The Constants (Lunar Regolith):** For the static parameters (those not provided by your color map), use the values derived from LROC global data:  
• b=0.24: Shape control for the phase function.  
• c=0.30: Backscatter/Forward scatter ratio.  
• BS0​=1.8: Shadow Hiding Opposition Surge amplitude.  
• hS​=0.07: Shadow Hiding width (controls how sharp the surge is).  
• θˉ=23.4∘: Macroscopic roughness angle.  
• ϕ=0.3: Filling factor (related to porosity).  
Shader Implementation Guide (WGSL adaptation)  
To implement this in your WebGPU pipeline, your Fragment Shader should calculate the following terms:  
1\. **Lommel-Seeliger Term:** This handles the "flat disk" look (lack of limb darkening).  
2\. **Phase Function (**p(g)**):** Use the **Henyey-Greenstein** double-lobed function to approximate how regolith dust scatters light. p(g)=21−c​(1+2bcosg+b2)1.51−b2​+21+c​(1−2bcosg+b2)1.51−b2​  
3\. **Opposition Surge (**BS​(g)**):** This creates the brightness spike at zero phase angle. BS​(g)=1+tan(g/2)/hS​1​  
4\. **Roughness and Multiple Scattering (**M**):** For a strict real-time implementation, you can often simplify the Multiple Scattering term (M) or use the "Isotropic Multiple Scattering Approximation" (IMSA) if performance allows.  
Handling the "Missing Latitudes"  
Your color map fills the poles (70°-90°) with Laser Altimeter (LDAM) data. Because this data is monochromatic, your w (albedo) input will simply be grayscale in those regions. The Hapke BRDF handles this naturally; the physics of light scattering on regolith does not require color, so the lighting behavior (opposition surge, etc.) will remain physically consistent across the transition from RGB to monochromatic data.  
Summary  
• **BRDF:** Hapke (2012 revision recommended).  
• **Texture Usage:** Treat the color map as the **Single Scattering Albedo (**w**)**.  
• **Key Parameters:** Use BS0​≈1.8 and hS​≈0.07 to achieve the correct "dusty" look and opposition surge.  
• **Warning:** Do **not** multiply the final calculated BRDF by the albedo map again at the end of the shader. The albedo is already integral to the math. Doing so would apply the albedo twice, resulting in an artificially dark moon.  
