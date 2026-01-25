/**
 * Wireframe shader for mesh rendering.
 *
 * Bind Groups:
 * - Group 0: Global uniforms (viewProjection)
 * - Group 1: Wireframe color
 * - Group 2: Model matrix
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

struct WireframeUniforms {
    color: vec4<f32>,
}

struct ModelUniforms {
    model: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> global: GlobalUniforms;
@group(1) @binding(0) var<uniform> wireframe: WireframeUniforms;
@group(2) @binding(0) var<uniform> model: ModelUniforms;

struct VertexInput {
    @location(0) position: vec3<f32>,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let worldPos = model.model * vec4<f32>(input.position, 1.0);
    output.position = global.viewProjection * worldPos;
    output.color = wireframe.color;
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return input.color;
}
