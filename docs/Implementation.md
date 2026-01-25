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
│   ├── terrain/        # CDLOD terrain system (M8+)
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
│       ├── Geometry (positions, normals, uvs?, indices → GPU buffers)
│       └── Material (SolidMaterial | TexturedMaterial)
├── Camera (position, target → view/projection matrices)
├── DirectionalLight (direction, color, intensity)
└── OrbitControls (spherical coords → camera updates)

GLTFLoader
├── load(url) → GLTFLoadResult { meshes, textures }
├── extractMesh() → creates Geometry + Material
└── generateFlatNormals() → fallback when NORMAL missing
```

**Data flow:**
1. `GLTFLoader.load()` parses glTF, creates Meshes with Geometry + Material
2. `Viewer.addMesh()` triggers `Mesh.createGPUResources()`
3. `OrbitControls` updates `Camera` position/target
4. Camera/control changes call `Viewer.requestRender()`
5. `renderLoop()` writes uniforms and issues draw calls

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

| Slot | Buffer | Stride | Format | Required |
|------|--------|--------|--------|----------|
| 0 | positions | 12 bytes | float32x3 | Yes |
| 1 | normals | 12 bytes | float32x3 | Yes |
| 2 | uvs | 8 bytes | float32x2 | No (textured only) |

Index buffer: Uint16 or Uint32 depending on vertex count.

**Geometry.hasUVs**: Returns true if UV coordinates are present. Used to select appropriate material/shader.

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

## GLTFLoader

Thin wrapper around `@loaders.gl/gltf` for loading glTF/GLB files.

### Load Flow

```
load(url, options)
    │
    ▼
[loaders.gl parses glTF + buffers + images]
    │
    ▼
postProcessGLTF() → typed accessors
    │
    ▼
For each mesh primitive:
├── Extract POSITION → Float32Array
├── Extract NORMAL (or generate flat normals)
├── Extract TEXCOORD_0 → Float32Array (optional)
├── Extract indices → Uint16/Uint32Array
├── Create Geometry
├── Create Material (Textured if GPU texture available, else Solid)
└── Return Mesh
```

### Flat Normal Generation

When NORMAL attribute is missing, generates face normals:

```typescript
for each triangle (i0, i1, i2):
    edge1 = positions[i1] - positions[i0]
    edge2 = positions[i2] - positions[i0]
    normal = normalize(cross(edge1, edge2))
    normals[i0] = normals[i1] = normals[i2] = normal
```

### Auto-Framing

After loading, main.ts computes bounding box and positions camera:

```typescript
// Compute combined bounds across all meshes
for each mesh:
    for each position vertex:
        min = componentMin(min, position)
        max = componentMax(max, position)

center = (min + max) / 2
size = max(max.x - min.x, max.y - min.y, max.z - min.z)

// Position camera along +Z axis
camera.position = [center.x, center.y, center.z + size * 2.5]
camera.target = center
orbitControls.reset(center)
```

## TexturedMaterial

Blinn-Phong material with texture sampling.

### Uniforms (Group 1, 32 bytes)

```
Offset  Size  Field
──────  ────  ─────
0       16    color: vec4<f32>        (multiplier)
16      4     shininess: f32
20      4     specularIntensity: f32  (0 = diffuse only)
24      8     (padding)
```

### Bind Group Layout

| Binding | Resource | Description |
|---------|----------|-------------|
| 0 | Sampler | Trilinear filtering, repeat wrap |
| 1 | Texture View | Base color texture |
| 2 | Uniform Buffer | color, shininess, specularIntensity |

### Texture Creation

```typescript
async function createTextureFromImage(
    device: GPUDevice,
    image: ImageBitmap | HTMLImageElement
): Promise<GPUTexture>
```

- Creates texture with `rgba8unorm` format
- Generates mipmaps via `copyExternalImageToTexture`
- Returns texture ready for bind group

## OrbitControls

Spherical coordinate camera controller.

### State

```typescript
_radius: number      // Distance from target
_polar: number       // Angle from +Y axis (0 = top, π = bottom)
_azimuth: number     // Rotation around Y axis
_target: Vec3        // Orbit center point
```

### Input Handling

| Input | Action |
|-------|--------|
| Left drag | Orbit (adjust polar/azimuth) |
| Right drag | Pan (move target in screen plane) |
| Scroll | Zoom (adjust radius) |

### reset(newTarget?)

Syncs spherical coordinates to current camera position after programmatic changes:

```typescript
reset(newTarget?: Vec3): void {
    if (newTarget) this._target = newTarget;

    offset = camera.position - this._target
    this._radius = length(offset)
    this._polar = acos(offset.y / radius)
    this._azimuth = atan2(offset.x, offset.z)
}
```

Call after `camera.setPosition()` or `camera.target = ...` to keep controls in sync.

## Type System

### Branded Types

```typescript
type MeshId = string & { readonly __brand: 'MeshId' };
type MaterialId = string & { readonly __brand: 'MaterialId' };
type GeometryId = string & { readonly __brand: 'GeometryId' };
type ObjectId = string & { readonly __brand: 'ObjectId' };
type QuadNodeId = string & { readonly __brand: 'QuadNodeId' };
type FaceId = 0 | 1 | 2 | 3 | 4 | 5;  // Cube face identifier
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

## CDLOD Terrain System

### Class Structure

```
QuadTree
├── roots[6]: QuadNode[]     # One root per cube face
└── traverse(), collectLeaves(), getStats()

QuadNode
├── faceId: FaceId           # Which cube face (0-5)
├── lodLevel: number         # Depth in tree (0 = root)
├── origin: Float64Array     # UV position [u, v] (0-1 range)
├── size: number             # Size in UV space
├── children[4]: QuadNode[]  # SW, SE, NW, NE (lazy)
├── boundingSphere           # For frustum culling (cached)
└── subdivide(), collapse()
```

### Coordinate Mapping

Each QuadNode stores UV coordinates (0-1) on its cube face. Conversion to 3D:

```typescript
// UV to cube direction (not normalized)
uvToCubeDirection(u, v): Float64Array {
  const uc = 2 * u - 1;  // Map 0..1 to -1..1
  const vc = 2 * v - 1;
  // Switch on faceId to get [x, y, z]
}

// Cube to sphere (spherified cube projection)
normalizeToSphere(cubeDir): Float64Array {
  return cubeDir / length(cubeDir);
}
```

### Bounding Sphere Calculation

Each node's bounding sphere encompasses its spherified patch:

1. Compute patch center on unit sphere
2. Sample 4 corners on sphere
3. Find max distance from center to any corner
4. Add 10% margin for surface curvature

Bounding spheres are cached (computed once per node).

### Child Layout

```
+-------+-------+
|  NW   |  NE   |  v + size
| (2)   | (3)   |
+-------+-------+
|  SW   |  SE   |  v
| (0)   | (1)   |
+-------+-------+
u      u+s/2   u+s
```

Children are created lazily via `subdivide()` and removed via `collapse()`.

### LOD Selection (M9)

```
LODSelector
├── config: LODConfig           # maxPixelError, screenHeight, fov, maxLodLevel, morphRatio
├── ranges: LODRange[]          # Pre-computed distance thresholds per LOD level
├── updateRanges()              # Recalculate on resize/FOV change
└── selectNodes(tree, camera, frustum) → NodeData[]

Frustum
├── planes[6]: FrustumPlane     # Left, Right, Bottom, Top, Near, Far
├── fromViewProjection(vp)      # Gribb/Hartmann plane extraction
├── intersectsSphere()          # Culling test
└── containsSphere()            # Full containment test

NodeData (32 bytes, GPU-ready)
├── relativeOrigin: vec3<f32>   # RTE position (12 bytes)
├── scale: f32                  # Node size in UV space (4 bytes)
├── lodLevel: u32               # For mipmap selection (4 bytes)
├── faceId: u32                 # Cube face 0-5 (4 bytes)
├── morphStart: f32             # Morph zone start (4 bytes)
└── morphEnd: f32               # LOD switch distance (4 bytes)
```

### LOD Range Calculation

Screen-space error metric determines distance thresholds:

```typescript
// fitParam: pixels per unit at distance 1
fitParam = screenHeight / (2 * tan(fov / 2))

// finestRange: distance where finest node has maxPixelError
finestNodeSize = 1 / 2^maxLodLevel
finestRange = (finestNodeSize * fitParam) / maxPixelError

// Each coarser level doubles the range
ranges[lod].distance = finestRange * 2^(maxLodLevel - lod)
ranges[lod].morphStart = ranges[lod].distance * morphRatio
```

### Selection Algorithm

```
selectNodes(tree, cameraPos, frustum):
  for each root in tree.roots:
    selectRecursive(root, cameraPos, frustum, results)
  return results

selectRecursive(node, cameraPos, frustum, results):
  // 1. Frustum cull
  if not frustum.intersectsSphere(node.boundingSphere):
    return  // Entire subtree culled

  // 2. Distance calculation (double precision)
  dist = distance(node.sphereCenter, cameraPos)

  // 3. LOD decision
  if dist < ranges[node.lodLevel].distance and node.lodLevel < maxLodLevel:
    node.subdivide() if needed
    for child in node.children:
      selectRecursive(child, ...)
  else:
    node.collapse() if subdivided
    results.push(createNodeData(node, cameraPos))
```

### Frustum Plane Extraction

Uses Gribb/Hartmann method on view-projection matrix (column-major):

```
Left plane:   row3 + row0
Right plane:  row3 - row0
Bottom plane: row3 + row1
Top plane:    row3 - row1
Near plane:   row3 + row2
Far plane:    row3 - row2
```

Each plane is normalized to unit normal form for distance calculations.

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
