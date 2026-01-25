/**
 * Textured Blinn-Phong lighting shader.
 *
 * Samples a diffuse texture and applies Blinn-Phong lighting.
 *
 * Bind Groups:
 * - Group 0: Global uniforms (camera + light)
 * - Group 1: Material uniforms (sampler, texture, color/shininess)
 * - Group 2: Object uniforms (model matrix)
 */

// Group 0: Global uniforms (camera + light)
struct GlobalUniforms {
    viewProjection: mat4x4<f32>,  // 0-63
    cameraPosition: vec3<f32>,    // 64-75, padded to 80
    _pad0: f32,
    lightDirection: vec3<f32>,    // 80-91, padded to 96
    _pad1: f32,
    lightColor: vec3<f32>,        // 96-107, padded to 112
    _pad2: f32,
    ambientColor: vec3<f32>,      // 112-123, padded to 128
    _pad3: f32,
}

// Group 1: Material uniforms (32 bytes)
struct MaterialUniforms {
    color: vec4<f32>,         // Color multiplier (RGBA) - offset 0, 16 bytes
    shininess: f32,           // Specular exponent - offset 16, 4 bytes
    specularIntensity: f32,   // Specular strength (0=none, 1=full) - offset 20
    _pad0: f32,               // padding - offset 24
    _pad1: f32,               // padding - offset 28, total 32 bytes
}

// Group 2: Object uniforms (per-mesh)
struct ObjectUniforms {
    model: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> global: GlobalUniforms;

@group(1) @binding(0) var texSampler: sampler;
@group(1) @binding(1) var texDiffuse: texture_2d<f32>;
@group(1) @binding(2) var<uniform> material: MaterialUniforms;

@group(2) @binding(0) var<uniform> object: ObjectUniforms;

// Vertex input (includes UV coordinates)
struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
}

// Vertex output / Fragment input
struct VertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
    @location(0) worldPosition: vec3<f32>,
    @location(1) worldNormal: vec3<f32>,
    @location(2) uv: vec2<f32>,
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    // Transform position to world space
    let worldPos = object.model * vec4<f32>(input.position, 1.0);
    output.worldPosition = worldPos.xyz;

    // Transform to clip space
    output.clipPosition = global.viewProjection * worldPos;

    // Transform normal to world space (assumes uniform scale)
    output.worldNormal = normalize((object.model * vec4<f32>(input.normal, 0.0)).xyz);

    // Pass UV to fragment shader
    output.uv = input.uv;

    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Sample diffuse texture
    let texColor = textureSample(texDiffuse, texSampler, input.uv);
    
    // Combine texture with material color multiplier
    let baseColor = texColor * material.color;

    // Normalize interpolated normal
    let N = normalize(input.worldNormal);

    // Light direction (pointing toward light)
    let L = normalize(-global.lightDirection);

    // View direction (pointing toward camera)
    let V = normalize(global.cameraPosition - input.worldPosition);

    // Halfway vector for Blinn-Phong
    let H = normalize(L + V);

    // Ambient component
    let ambient = global.ambientColor * baseColor.rgb;

    // Diffuse component (Lambertian)
    let NdotL = max(dot(N, L), 0.0);
    let diffuse = global.lightColor * baseColor.rgb * NdotL;

    // Specular component (Blinn-Phong)
    // Only apply specular when surface faces light (NdotL > 0) and specularIntensity > 0
    let NdotH = max(dot(N, H), 0.0);
    let specularStrength = select(0.0, pow(NdotH, material.shininess), NdotL > 0.0);
    let specular = global.lightColor * specularStrength * material.specularIntensity;

    // Combine components
    let finalColor = ambient + diffuse + specular;

    return vec4<f32>(finalColor, baseColor.a);
}
