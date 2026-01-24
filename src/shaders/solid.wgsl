/**
 * Solid color shader with MVP transforms.
 * Vertex transformation + flat color output.
 *
 * Bind Groups:
 * - Group 0: Global uniforms (view-projection matrix)
 * - Group 1: Material uniforms (color)
 * - Group 2: Object uniforms (model matrix)
 */

// Group 0: Global uniforms (camera)
struct GlobalUniforms {
    viewProjection: mat4x4<f32>,
}

// Group 1: Material uniforms
struct MaterialUniforms {
    color: vec4<f32>,
}

// Group 2: Object uniforms (per-mesh)
struct ObjectUniforms {
    model: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> global: GlobalUniforms;
@group(1) @binding(0) var<uniform> material: MaterialUniforms;
@group(2) @binding(0) var<uniform> object: ObjectUniforms;

// Vertex input
struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
}

// Vertex output / Fragment input
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    // Transform position: projection * view * model * position
    let worldPos = object.model * vec4<f32>(input.position, 1.0);
    output.position = global.viewProjection * worldPos;

    // Transform normal (simplified, assumes uniform scale)
    output.normal = (object.model * vec4<f32>(input.normal, 0.0)).xyz;

    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Simple flat color (no lighting yet)
    return material.color;
}
