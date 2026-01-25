# LunaVis Implementation

Technical details of the codebase structure and data flow.

## Project Structure

```
LunaVis/
├── src/
│   ├── core/           # Viewer, Scene, Camera
│   ├── objects/        # Object3D, Mesh, DirectionalLight
│   ├── geometry/       # Geometry, primitives
│   ├── materials/      # SolidMaterial (Blinn-Phong)
│   ├── loaders/        # glTF loader (M5)
│   ├── controls/       # OrbitControls, FlyControls (M6)
│   ├── shaders/        # blinn-phong.wgsl, solid.wgsl
│   ├── types/          # TypeScript type definitions
│   └── main.ts         # Entry point + Tweakpane UI
├── tests/
│   ├── *.test.ts       # Unit tests (Vitest)
│   └── e2e/            # E2E tests (Playwright)
├── scripts/
│   └── download-assets.sh  # Discovers and runs asset download scripts
├── assets/             # Static assets served at root URL
│   ├── models/         # glTF/GLB model files (committed)
│   ├── lunar/          # NASA Moon data (downloaded at build time)
│   │   ├── download.sh
│   │   └── README.md   # Attribution and data format docs
│   └── CREDITS.md      # Asset attribution index
└── docs/               # Documentation
```

## Asset Management

Large binary assets (textures, elevation maps) are not committed to git. Instead, each asset folder contains:

- `download.sh` — Script to fetch files from canonical sources
- `README.md` — Attribution, license, and data format documentation

The build process runs `scripts/download-assets.sh`, which discovers and executes all `download.sh` scripts in `assets/`.

**Gitignored asset types:** `.tif`, `.tiff`, `.exr`, `.jpg`, `.jpeg`, `.png`, `.gltf`, `.glb`  
**Exception:** `assets/models/*.glb` is explicitly tracked for small committed models.

## Class Relationships

```
Viewer
├── Scene (root Object3D)
│   └── Mesh[] (extends Object3D)
│       ├── Geometry (positions, normals, indices → GPU buffers)
│       └── SolidMaterial (color, shininess → pipeline + bind group)
├── Camera (position, target → view/projection matrices)
└── DirectionalLight (direction, color, intensity)
```

**Data flow:**
1. `Viewer.addMesh()` triggers `Mesh.createGPUResources()`
2. `OrbitControls` updates `Camera` position/target
3. Camera/control changes call `Viewer.requestRender()`
4. `renderLoop()` writes uniforms and issues draw calls

## Coordinate System

See [Design.md](Design.md#coordinate-system) for rationale.

**Quick reference:**
- Right-handed, Y-up (matches glTF)
- Camera default: `(0, 0, +dist)` looking at origin
- Light direction points *toward* surfaces
- WebGPU clip Z: [0, 1] (not [-1, 1])

**OrbitControls:**
- Spherical coordinates around target point
- Polar angle (θ): 0 = top, π = bottom
- Azimuth (φ): rotation around Y axis
- `controls.reset(target)` — sync after programmatic camera changes

## Bind Group Layout

| Group | Binding | Contents | Size | Visibility |
|-------|---------|----------|------|------------|
| 0 | 0 | Global uniforms | 128 bytes | VERTEX + FRAGMENT |
| 1 | 0 | Material uniforms | 32 bytes | FRAGMENT |
| 2 | 0 | Model matrix | 64 bytes | VERTEX |

## Uniform Buffer Layouts

### Global Uniforms (Group 0, 128 bytes)

```
Offset  Size  Field
──────  ────  ─────
0       64    viewProjection: mat4x4<f32>
64      12    cameraPosition: vec3<f32>
76      4     (padding)
80      12    lightDirection: vec3<f32>
92      4     (padding)
96      12    lightColor: vec3<f32>
108     4     (padding)
112     12    ambientColor: vec3<f32>
124     4     (padding)
```

Written once per frame in `Viewer.renderLoop()`.

### Material Uniforms (Group 1, 32 bytes)

```
Offset  Size  Field
──────  ────  ─────
0       16    color: vec4<f32>
16      4     shininess: f32
20      12    (padding)
```

Written when material properties change.

### Model Uniforms (Group 2, 64 bytes)

```
Offset  Size  Field
──────  ────  ─────
0       64    model: mat4x4<f32>
```

Written per mesh before each draw call.

## Rendering Pipeline

### Frame Flow

```
requestRender()
    │
    ▼
[dirty flag set, RAF scheduled]
    │
    ▼
renderLoop()
    ├── Build global uniform data (128 bytes)
    ├── writeBuffer(globalUniformBuffer)
    ├── getCurrentTexture() → textureView
    ├── createCommandEncoder()
    ├── beginRenderPass(color + depth attachments)
    │
    ├── for each mesh in scene:
    │   ├── material.updateUniforms()
    │   ├── mesh.updateModelMatrix()
    │   ├── setPipeline()
    │   ├── setBindGroup(0, globalBindGroup)
    │   ├── setBindGroup(1, materialBindGroup)
    │   ├── setBindGroup(2, modelBindGroup)
    │   ├── setVertexBuffer(0, positions)
    │   ├── setVertexBuffer(1, normals)
    │   ├── setIndexBuffer()
    │   └── drawIndexed()
    │
    ├── renderPass.end()
    ├── queue.submit([commandEncoder.finish()])
    └── emit 'frame-rendered' event (first frame only, for E2E tests)
```

### Vertex Buffer Layout

| Slot | Buffer | Stride | Format |
|------|--------|--------|--------|
| 0 | positions | 12 bytes | float32x3 |
| 1 | normals | 12 bytes | float32x3 |

Index buffer: Uint16 or Uint32 depending on vertex count.

## Shader Structure

### blinn-phong.wgsl

**Vertex stage:**
- Transform position: `viewProjection * model * position`
- Transform normal: `model * normal` (assumes uniform scale)
- Output: clip position, world position, world normal

**Fragment stage:**
- Normalize interpolated normal
- Compute L (light direction), V (view direction), H (halfway)
- Ambient: `ambientColor * materialColor`
- Diffuse: `lightColor * materialColor * max(dot(N, L), 0)`
- Specular: `lightColor * pow(max(dot(N, H), 0), shininess)`
- Output: `ambient + diffuse + specular`

## Type System

### Branded Types

```typescript
type MeshId = string & { readonly __brand: 'MeshId' };
type MaterialId = string & { readonly __brand: 'MaterialId' };
type GeometryId = string & { readonly __brand: 'GeometryId' };
type ObjectId = string & { readonly __brand: 'ObjectId' };
```

Prevents accidentally passing a `MeshId` where a `MaterialId` is expected.

### Result Type

```typescript
type Result<T, E> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T, never>;
function err<E>(error: E): Result<never, E>;
function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T };
function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E };
```

Used for operations that can fail without throwing.

## Buffer Alignment

### writeBuffer Alignment

WebGPU requires 4-byte alignment for `writeBuffer()`:

- `Float32Array` — naturally aligned
- `Uint16Array` (indices) — must pad to multiple of 4 bytes

```typescript
// Pad Uint16 index data for writeBuffer
const padded = new Uint16Array(Math.ceil(indices.length / 2) * 2);
padded.set(indices);
device.queue.writeBuffer(buffer, 0, padded);
```

### WGSL Uniform Struct Alignment

**Critical:** WGSL types in uniform buffers have strict alignment requirements:

| Type | Alignment | Size |
|------|-----------|------|
| `f32` | 4 bytes | 4 bytes |
| `vec2<f32>` | 8 bytes | 8 bytes |
| `vec3<f32>` | **16 bytes** | 12 bytes |
| `vec4<f32>` | 16 bytes | 16 bytes |
| `mat4x4<f32>` | 16 bytes | 64 bytes |

**Common Pitfall:** Using `vec3<f32>` for padding creates gaps:

```wgsl
// WRONG: vec3 has 16-byte alignment, not 4-byte!
struct Bad {
    color: vec4<f32>,      // offset 0, 16 bytes
    shininess: f32,        // offset 16, 4 bytes
    _pad: vec3<f32>,       // offset 32 (not 20!), 12 bytes → total 44 bytes
}

// CORRECT: Use f32 for precise padding
struct Good {
    color: vec4<f32>,      // offset 0, 16 bytes
    shininess: f32,        // offset 16, 4 bytes
    _pad0: f32,            // offset 20, 4 bytes
    _pad1: f32,            // offset 24, 4 bytes
    _pad2: f32,            // offset 28, 4 bytes → total 32 bytes
}
```

Mismatched CPU/GPU struct sizes cause out-of-bounds reads → GPU hangs.

## Transform Hierarchy

`Object3D` maintains local and world matrices:

```
localMatrix = translate(position) * rotate(quaternion) * scale(scale)
worldMatrix = parent.worldMatrix * localMatrix
```

Matrices are cached and recomputed only when:
- Local transform changes → `_matrixNeedsUpdate = true`
- Parent world matrix changes → `_worldMatrixNeedsUpdate = true` (propagates to children)

## Lunar Texture Formats

### Color/Albedo Map (M7)

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Bit depth | 8-bit | sRGB encoding provides 12-bit perceptual precision |
| Color space | sRGB | GPU linearizes on sample (hardware accelerated) |
| Container | KTX2 | Pre-baked mipmaps, Zstd compression |
| Compression | Zstd (lossless) | Preserves albedo values exactly |

**Conversion command:**
```bash
ktx create --format R8G8B8_SRGB --generate-mipmap --zstd 19 output.ktx2 input.png
```

### Displacement Map (M13)

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Bit depth | 16-bit | Terrain precision requires full dynamic range |
| Format | TIFF (source) | Read directly, no conversion loss |
| Processing | Vertex shader | CDLOD samples heightmap per-vertex with explicit mip selection |
| Mipmaps | Pre-generated | One mip per LOD level for anti-aliasing |

The displacement map is sampled in the vertex shader using `textureSampleLevel()` with explicit mip selection based on the current LOD level.
