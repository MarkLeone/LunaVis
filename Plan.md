This is a comprehensive programming plan for a **Hybrid WebGPU 3D Model Viewer**. This plan is designed for an experienced graphics engineer, focusing on a Three.js-style API surface while implementing a specific hybrid pipeline: **Rasterization** for the main geometry pass and **Compute Shaders** for ray-casted shadows (a technique that bypasses standard shadow mapping artifacts but requires explicit geometry management).

### 1\. Technology Stack & Tooling

* **Language:** TypeScript 5.x.  
* **Build Tool:** Vite (configured for raw shader imports).  
* *Configuration:* Use ?raw suffix for importing .wgsl files as strings 1\.  
* **Math Library:** wgpu-matrix (for optimized WASM-friendly matrix operations).  
* **Loader:** glTFLoader (minimal parser) \+ Custom buffer unpacker.

### 2\. High-Level API Design (The "User" Experience)

The goal is to mask the verbosity of WebGPU behind a semantic API similar to Three.js 2, 3\.  
// Entry Point Example  
import { Viewer, Scene, Mesh, DirectionalLight, GLTFLoader } from './engine';  
import simpleShader from './shaders/blinn-phong.wgsl?raw';

async function main() {  
  const canvas \= document.getElementById('gpu-canvas') as HTMLCanvasElement;  
    
  // 1\. Initialize Viewer (Handles Adapter/Device/Context)  
  const viewer \= new Viewer(canvas);  
  await viewer.init(); 

  // 2\. Scene Graph  
  const scene \= new Scene();  
    
  // 3\. Asset Loading  
  const loader \= new GLTFLoader();  
  const model: Mesh \= await loader.load('./assets/duck.glb');  
  scene.add(model);

  // 4\. Lighting (Data source for Compute Shadows)  
  const light \= new DirectionalLight({ x: 10, y: 10, z: 10 });  
  scene.add(light);

  // 5\. Reactive Render Loop  
  // The viewer observes the scene. Changing a prop triggers a frame.  
  viewer.render(scene);   
}

### 3\. Core Architecture Modules

#### A. The Viewer Class (Engine Core)

This class encapsulates the GPUDevice, GPUCanvasContext, and the main event loop.

* **Responsibilities:**  
* Async initialization (requestAdapter, requestDevice) 4, 5\.  
* Configuring the canvas context (alpha mode, preferred format) 6, 7\.  
* Managing the **Reactive Event Loop**. Instead of a constant requestAnimationFrame, use a dirty flag.  
* Handling ResizeObserver 8, 9\.

**Reactive Loop Logic:**  
class Viewer {  
  private dirty: boolean \= true;  
    
  public requestRender() {  
    if (\!this.dirty) {  
      this.dirty \= true;  
      requestAnimationFrame(this.renderLoop.bind(this));  
    }  
  }

  private renderLoop() {  
    this.dirty \= false;  
    this.renderer.render(this.scene, this.camera);  
  }  
}

#### B. The Renderer Class

Handles the specific WebGPU pipeline orchestration. Because we are doing **Compute Shadows**, the renderer must manage two distinct passes per frame.

1. **Compute Pass:** Ray-cast against scene geometry to generate a shadow mask (texture).  
2. **Render Pass:** Rasterize geometry using Blinn-Phong, sampling the shadow mask.

#### C. The Mesh & Geometry Classes (OO Abstraction)

To support compute-based shadows, geometry data must be accessible to *both* the vertex shader (for rasterization) and the compute shader (for ray intersection).

* **Constraint:** Vertex Buffers are not randomly accessible in Compute Shaders.  
* **Solution:** We will upload geometry data into GPUBuffers with usage STORAGE | VERTEX | COPY\_DST 10, 11\.

**Class Structure:**

* **Geometry**:  
* Properties: positions, normals, uvs, indices.  
* GPU Resources: vertexBuffer, indexBuffer.  
* *Special:* triangleStorageBuffer (A packed Float32Array of raw triangle data for the compute shader) 10\.  
* **Material**:  
* Holds GPUBindGroup and GPURenderPipeline.  
* Manages layout: 'auto' generation 12\.  
* **Mesh**:  
* Extends Object3D (position/rotation/scale).  
* Links Geometry \+ Material.  
* Owns a UniformBuffer for its Model Matrix (local uniforms) 13\.

### 4\. Detailed Pipeline Implementation

#### Phase 1: The Compute Shadow Pass (Ray Tracing)

This is the deviation from standard rendering. We will not render a shadow map. We will compute visibility.  
**Data Requirements:**

1. **Triangle Buffer:** A read-only-storage buffer containing all scene triangles. (For the MVP, we will flatten the scene graph into one large buffer or an array of buffers).  
2. **Light Data:** A Uniform buffer containing light direction/position.  
3. **Output Texture:** A storage texture (r8unorm or rgba8unorm) representing the shadow mask 14\.

**Compute Shader (shadows.wgsl):**

1. **Workgroups:** Dispatch 1 thread per pixel of the screen (or the shadow mask resolution) 15\.  
2. **Logic:**  
3. Calculate Ray Origin (World Pos corresponding to pixel) and Ray Direction (towards Light).  
4. Iterate through the **Triangle Buffer** 16\.  
5. Perform Ray-Triangle Intersection (Möller–Trumbore algorithm).  
6. If hit found with $t \< distance\\\_to\\\_light$, write 0.0 (shadow) to texture; otherwise 1.0 (lit).  
7. *Optimization:* Implement a basic Bounding Box check in the shader before checking triangles to prevent GPU timeouts on complex meshes.

**API Integration:**  
// Inside Renderer.render()  
const computePass \= commandEncoder.beginComputePass();  
computePass.setPipeline(this.shadowPipeline);  
computePass.setBindGroup(0, this.geometryBindGroup); // Scene triangles  
computePass.setBindGroup(1, this.outputTextureBindGroup); // Write-only texture  
computePass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));  
computePass.end();

#### Phase 2: The Rasterization Pass (Blinn-Phong)

Standard forward rendering, but utilizing the result of the compute pass.  
**Shader (blinn-phong.wgsl):**

1. **Vertex Stage:** Standard MVP transformation.  
2. **Fragment Stage:**  
3. Calculate Ambient \+ Diffuse \+ Specular.  
4. **Sampling:** Read from the ShadowMaskTexture generated in Phase 1\. Since it corresponds to screen coordinates, use gl\_FragCoord (or @builtin(position)) to sample the texture.  
5. Final Color \= Ambient \+ (Diffuse \+ Specular) \* ShadowFactor.

**Binding Strategy (layout: 'auto'):**

* **Group 0 (Global):** Camera uniforms, Light uniforms, **ShadowMaskTexture** (read-only sampled texture) 17\.  
* **Group 1 (Material):** Diffuse texture, Specular params.  
* **Group 2 (Object):** Model Matrix.

### 5\. Data & Event Management

#### Uniform Management

We will strictly follow the "One GPUBuffer per object" rule for local transforms as requested, updating via device.queue.writeBuffer 18\.

* **Alignment:** Ensure strict 16-byte alignment for WGSL structs (padding floats where necessary) 19, 20\.

#### Input Handling & Reactivity

* **InputController:** Listen to pointerdown, pointermove, wheel.  
* **Decoupled Logic:**  
* Events update the **Camera State** (e.g., spherical coordinates).  
* Upon update, call viewer.requestRender().  
* This ensures the heavy GPU work only happens when the user interacts, satisfying the power-saving requirement.

#### Asset Loader (Micro-library)

1. Use glTFLoader to parse the JSON.  
2. **Binary Parsing:** Manually iterate accessors and bufferViews to extract TypedArrays 21\.  
3. **Conversion:**  
4. Extract POSITION accessor \-\> Create Vertex Buffer.  
5. Extract POSITION accessor \-\> **Duplicate** data into the Triangle Storage Buffer (for compute shadows).  
6. Extract INDICES \-\> Create Index Buffer.

### 6\. Implementation Roadmap

1. **Scaffolding:** Set up Vite project, raw shader imports, and the Viewer class with a simple "Clear Screen" render pass 22\.  
2. **Triangle Pipeline:** Implement Geometry and Mesh classes to render a hardcoded triangle using a basic pipeline.  
3. **Object-Oriented Refactor:** Implement the Scene graph and Camera with matrix updates.  
4. **Compute Infrastructure:** Implement the "Triangle Storage Buffer" creation. Create a debug compute shader that just writes solid white to a texture and displays it on a quad to verify the compute-to-raster pipeline.  
5. **Ray Tracing Kernel:** Implement the Ray-Triangle intersection in WGSL. Hook up the storage buffer.  
6. **Lighting Integration:** Combine the compute output (shadow mask) into the Blinn-Phong fragment shader.  
7. **glTF Loader:** Implement the parser to populate the Geometry objects from real files.

### 7\. Potential Pitfalls & Mitigations

* **Synchronization:** Ensure the Compute Pass ends before the Render Pass begins. WebGPU handles this implicitly if the texture dependency is declared, but explicit barriers or splitting command buffers might be needed if synchronization issues arise 23, 24\.  
* **Performance (Compute):** Naive ray-casting against *every* triangle for *every* pixel is $O(N \\times Pixels)$. For a basic viewer, this is acceptable for low-poly models (\<5k triangles). For larger models, the plan must include a simple Uniform Grid or Bounding Box check in the WGSL shader to reject rays early 25\.  
* **layout: 'auto' limitations:** You cannot share bind groups easily between the Compute Pipeline and Render Pipeline if both use auto.  
* *Mitigation:* Create the BindGroupLayout explicitly for the **Scene Data** (Group 0\) so it can be shared between the Compute Shader (reading geometry) and Render Shader (reading lights/camera) 26\.

This plan provides the structure to build a modern, high-performance viewer that meets your specific constraints regarding architecture and shadow techniques.  
