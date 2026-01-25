/**
 * Debug bounds shader for CDLOD terrain visualization.
 * Renders bounding spheres as wireframe circles (3 great circles).
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
    uvOrigin: vec2<f32>,
    _pad0: f32,
    scale: f32,
    lodLevel: u32,
    faceId: u32,
    radius: f32,
    _pad1: f32,
}

struct DebugConfig {
    maxLodLevel: u32,
    sphereRadius: f32,
    lineWidth: f32,
    _pad: f32,
}

@group(0) @binding(0) var<uniform> global: GlobalUniforms;
@group(1) @binding(0) var<storage, read> nodes: array<NodeData>;
@group(1) @binding(1) var<uniform> debugConfig: DebugConfig;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @builtin(instance_index) instanceIdx: u32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>,
}

fn uvToCubeDir(faceId: u32, uv: vec2<f32>) -> vec3<f32> {
    let uc = 2.0 * uv.x - 1.0;
    let vc = 2.0 * uv.y - 1.0;

    switch (faceId) {
        case 0u: { return vec3<f32>(uc, vc, 1.0); }
        case 1u: { return vec3<f32>(-uc, vc, -1.0); }
        case 2u: { return vec3<f32>(1.0, vc, -uc); }
        case 3u: { return vec3<f32>(-1.0, vc, uc); }
        case 4u: { return vec3<f32>(uc, 1.0, -vc); }
        default: { return vec3<f32>(uc, -1.0, vc); }
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
    let uvCenter = node.uvOrigin + vec2<f32>(node.scale * 0.5, node.scale * 0.5);
    let cubeDir = uvToCubeDir(node.faceId, uvCenter);
    let sphereCenter = normalize(cubeDir) * debugConfig.sphereRadius;

    let worldPos = sphereCenter + input.position * node.radius;
    output.position = global.viewProjection * vec4<f32>(worldPos, 1.0);
    output.color = lodToColor(node.lodLevel, debugConfig.maxLodLevel);

    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(input.color, 1.0);
}
