/**
 * Debug wireframe shader for CDLOD terrain visualization.
 *
 * Renders terrain patches as wireframes on a unit sphere, with color
 * indicating LOD level (red = 0, violet = max).
 *
 * Uses instanced rendering: one draw call renders all visible nodes.
 * Each instance reads its NodeData from a storage buffer.
 *
 * Bind Groups:
 * - Group 0: Global uniforms (viewProjection)
 * - Group 1: NodeData storage buffer + debug config
 */

// Group 0: Global uniforms (reuses existing layout)
struct GlobalUniforms {
    viewProjection: mat4x4<f32>,
    cameraPosition: vec3<f32>,
    _pad0: f32,
    lightDirection: vec3<f32>,
    _pad1: f32,
    lightColor: vec3<f32>,
    _pad2: f32,
    ambientColor: vec3<f32>,
    _pad3: f32,
}

// Debug node data (32 bytes, matches DebugRenderer packing)
struct NodeData {
    uvOrigin: vec2<f32>,         // 8 bytes (offset 0)
    _pad0: f32,                  // 4 bytes (offset 8)
    scale: f32,                  // 4 bytes (offset 12)
    lodLevel: u32,               // 4 bytes (offset 16)
    faceId: u32,                 // 4 bytes (offset 20)
    radius: f32,                 // 4 bytes (offset 24)
    _pad1: f32,                  // 4 bytes (offset 28)
}

// Debug configuration
struct DebugConfig {
    maxLodLevel: u32,            // For color gradient calculation
    sphereRadius: f32,           // Radius of the sphere (1.0 for unit sphere)
    lineWidth: f32,              // Not used yet (for future shader-based lines)
    _pad: f32,
}

@group(0) @binding(0) var<uniform> global: GlobalUniforms;
@group(1) @binding(0) var<storage, read> nodes: array<NodeData>;
@group(1) @binding(1) var<uniform> debugConfig: DebugConfig;

// Vertex input: grid UV position (0-1 range)
struct VertexInput {
    @location(0) gridUV: vec2<f32>,
    @builtin(instance_index) instanceIdx: u32,
}

// Vertex output
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>,
}

/**
 * Convert UV coordinates on a cube face to a 3D direction vector.
 *
 * Face mapping (right-handed Y-up):
 * - Face 0 (+Z): front
 * - Face 1 (-Z): back
 * - Face 2 (+X): right
 * - Face 3 (-X): left
 * - Face 4 (+Y): top
 * - Face 5 (-Y): bottom
 */
fn uvToCubeDir(faceId: u32, uv: vec2<f32>) -> vec3<f32> {
    // Map 0..1 UV to -1..1 range
    let uc = 2.0 * uv.x - 1.0;
    let vc = 2.0 * uv.y - 1.0;

    switch (faceId) {
        case 0u: { return vec3<f32>(uc, vc, 1.0); }   // +Z (front)
        case 1u: { return vec3<f32>(-uc, vc, -1.0); } // -Z (back)
        case 2u: { return vec3<f32>(1.0, vc, -uc); }  // +X (right)
        case 3u: { return vec3<f32>(-1.0, vc, uc); }  // -X (left)
        case 4u: { return vec3<f32>(uc, 1.0, -vc); }  // +Y (top)
        default: { return vec3<f32>(uc, -1.0, vc); }  // -Y (bottom)
    }
}

/**
 * Convert LOD level to a color using HSV gradient.
 * LOD 0 = red (hue 0), LOD max = violet (hue ~270)
 */
fn lodToColor(lodLevel: u32, maxLod: u32) -> vec3<f32> {
    // Hue: 0 (red) to 0.75 (violet) based on LOD level
    let hue = f32(lodLevel) / f32(max(maxLod, 1u)) * 0.75;

    // HSV to RGB (saturation = 1, value = 1)
    let c = 1.0;
    let x = c * (1.0 - abs(fract(hue * 6.0) * 2.0 - 1.0));

    let h6 = hue * 6.0;
    var rgb: vec3<f32>;

    if (h6 < 1.0) {
        rgb = vec3<f32>(c, x, 0.0);
    } else if (h6 < 2.0) {
        rgb = vec3<f32>(x, c, 0.0);
    } else if (h6 < 3.0) {
        rgb = vec3<f32>(0.0, c, x);
    } else if (h6 < 4.0) {
        rgb = vec3<f32>(0.0, x, c);
    } else if (h6 < 5.0) {
        rgb = vec3<f32>(x, 0.0, c);
    } else {
        rgb = vec3<f32>(c, 0.0, x);
    }

    return rgb;
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    // Get node data for this instance
    let node = nodes[input.instanceIdx];

    // Transform grid UV to node's local UV space
    // Grid UV is 0-1, node covers a region on its face
    // Node origin is the bottom-left corner in face UV space
    // We need to map grid (0,0)-(1,1) to node region

    // The node's UV region on the face:
    // - Origin at (node.relativeOrigin.x, node.relativeOrigin.y) in face UV space
    // - Size is node.scale
    //
    // Wait, relativeOrigin is RTE position (camera-relative world pos).
    // We need the UV origin. Let me reconsider...
    //
    // Actually, for debug visualization we can derive UV from the node's position.
    // The relativeOrigin is the center point on the sphere (camera-relative).
    // For proper UV mapping, we should pass UV origin separately.
    //
    // Simpler approach for debug: use the node's sphere center position directly
    // and offset based on scale. This won't be perfectly accurate but good enough
    // for debug visualization.
    //
    // Better: We'll compute the UV position from the grid and node properties.
    // Since this is debug code, let's use a simpler approach that works:
    //
    // The shader receives grid positions (0-1) and needs to map them to the sphere.
    // We'll use the node's faceId and compute UV based on the instance.
    //
    // For now, let's assume the CPU passes additional UV origin data.
    // Actually, looking at NodeData, we have relativeOrigin which is the
    // sphere center minus camera position.
    //
    // Let me think about this differently:
    // - relativeOrigin is vec3 position on sphere (relative to camera)
    // - scale is the node's size in UV space (0-1 for root, halves each level)
    // - We need to map grid UV (0-1) to the node's region
    //
    // The trick: we can compute the node's UV origin from its center and scale.
    // Node center UV = some point, and the node extends scale/2 in each direction.
    //
    // For debug purposes, let's use a simplified approach:
    // 1. The grid UV (0-1) represents the local patch
    // 2. We scale it by node.scale and offset to the node's region
    // 3. Then project to the sphere
    //
    // Problem: we don't have the node's UV origin in NodeData.
    // Solution: We'll modify NodeData to include UV origin, or compute it.
    //
    // Actually, for M10 debug visualization, let's use the relativeOrigin
    // as a base and compute positions geometrically. The shader will:
    // 1. Compute the tangent frame at the node center
    // 2. Offset by grid UV * scale
    //
    // This is complex. Simpler approach for debug:
    // Since we're on a unit sphere, let's compute positions directly
    // by reconstructing the UV from face and LOD level.
    //
    // SIMPLEST APPROACH for M10:
    // - Pass UV origin as part of relativeOrigin (repurpose the data)
    // - Or: pack UV origin into unused bits
    //
    // Let me just use a hacky but working approach:
    // The relativeOrigin.xy will store face UV origin (0-1)
    // The relativeOrigin.z will be repurposed or we add new data
    //
    // Actually, let's extend NodeData with UV origin in the DebugRenderer.
    // For now, assume relativeOrigin contains: [uOrigin, vOrigin, unused]
    // and we compute sphere position from UV.

    // Get node's UV origin on face
    let uvOrigin = node.uvOrigin;

    // Compute this vertex's UV on the face
    let faceUV = uvOrigin + input.gridUV * node.scale;

    // Convert face UV to cube direction, then normalize to sphere
    let cubeDir = uvToCubeDir(node.faceId, faceUV);
    let spherePos = normalize(cubeDir) * debugConfig.sphereRadius;

    // Apply view-projection (no model matrix, sphere is at world origin)
    // For RTE, we'd subtract camera position, but for unit sphere debug
    // we can use world coords directly since the sphere is small
    output.position = global.viewProjection * vec4<f32>(spherePos, 1.0);

    // Color by LOD level
    output.color = lodToColor(node.lodLevel, debugConfig.maxLodLevel);

    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(input.color, 1.0);
}
