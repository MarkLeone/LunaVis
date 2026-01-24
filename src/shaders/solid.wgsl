/**
 * Solid color shader for M2: Triangle Rendering.
 * Simple vertex transformation + flat color output.
 */

// Per-object uniforms (bind group 0)
struct ObjectUniforms {
    color: vec4<f32>,
}

@group(0) @binding(0) var<uniform> object: ObjectUniforms;

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
    // Pass through position (no transformation for now)
    output.position = vec4<f32>(input.position, 1.0);
    output.normal = input.normal;
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Simple flat color
    return object.color;
}
