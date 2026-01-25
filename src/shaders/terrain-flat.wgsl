/**
 * Flat cube-face terrain shader (M11).
 *
 * Renders instanced grid patches on cube faces (no sphere projection yet).
 * Uses LOD-based debug coloring for visual verification.
 *
 * Bind Groups:
 * - Group 0: Global uniforms (viewProjection)
 * - Group 1: NodeData storage buffer + terrain config
 */

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

struct NodeData {
    relativeOrigin: vec3<f32>, // xy = UV origin, z unused for M11
    scale: f32,
    lodLevel: u32,
    faceId: u32,
    morphStart: f32,
    morphEnd: f32,
}

struct TerrainConfig {
    maxLodLevel: u32,
    _pad0: vec3<f32>,
}

@group(0) @binding(0) var<uniform> global: GlobalUniforms;
@group(1) @binding(0) var<storage, read> nodes: array<NodeData>;
@group(1) @binding(1) var<uniform> config: TerrainConfig;

struct VertexInput {
    @location(0) gridUV: vec2<f32>,
    @builtin(instance_index) instanceIdx: u32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>,
}

fn uvToCubePos(faceId: u32, uv: vec2<f32>) -> vec3<f32> {
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

fn lodToColor(lodLevel: u32, maxLod: u32) -> vec3<f32> {
    let hue = f32(lodLevel) / f32(max(maxLod, 1u)) * 0.75;

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
    let node = nodes[input.instanceIdx];

    let uvOrigin = node.relativeOrigin.xy;
    let faceUV = uvOrigin + input.gridUV * node.scale;
    let cubePos = uvToCubePos(node.faceId, faceUV);

    output.position = global.viewProjection * vec4<f32>(cubePos, 1.0);
    output.color = lodToColor(node.lodLevel, config.maxLodLevel);
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(input.color, 1.0);
}
