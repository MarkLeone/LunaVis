/**
 * TexturedMaterial: Blinn-Phong lit material with texture support.
 * Creates render pipeline and bind groups for textured lit rendering.
 *
 * Bind Group Layout:
 * - Group 0: Global uniforms (camera + light)
 * - Group 1: Material uniforms (sampler, texture, shininess)
 * - Group 2: Object uniforms (model matrix) - managed by Mesh
 */

import type { MaterialId, Color } from '@/types';
import { materialId } from '@/types';
import shaderSource from '@/shaders/textured-blinn-phong.wgsl?raw';

/** Material configuration with texture */
export interface TexturedMaterialOptions {
  /** Base color multiplier (default: white) */
  color?: Color;
  /** Specular shininess exponent (default: 32) */
  shininess?: number;
  /** Specular intensity multiplier (0 = no specular, 1 = full specular) (default: 1) */
  specularIntensity?: number;
}

/** GPU resources for a textured material */
export interface TexturedMaterialResources {
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  modelBindGroupLayout: GPUBindGroupLayout;
}

/**
 * Blinn-Phong lit material with texture.
 *
 * @example
 * ```ts
 * const texture = await createTextureFromImage(device, image);
 * const material = new TexturedMaterial(texture, { shininess: 64 });
 * const resources = material.createResources(device, format, globalBindGroupLayout);
 * ```
 */
export class TexturedMaterial {
  readonly id: MaterialId;
  readonly texture: GPUTexture;
  private _color: Color;
  private _shininess: number;
  private _specularIntensity: number;
  private resources: TexturedMaterialResources | null = null;
  private needsUpdate = true;
  private sampler: GPUSampler | null = null;

  constructor(texture: GPUTexture, options?: TexturedMaterialOptions) {
    this.id = materialId(`texmat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    this.texture = texture;
    this._color = options?.color ?? [1, 1, 1, 1];
    this._shininess = options?.shininess ?? 32;
    this._specularIntensity = options?.specularIntensity ?? 1.0;
  }

  /** Get current color multiplier */
  get color(): Color {
    return this._color;
  }

  /** Set color multiplier (marks material for GPU update) */
  set color(value: Color) {
    this._color = value;
    this.needsUpdate = true;
  }

  /** Get shininess */
  get shininess(): number {
    return this._shininess;
  }

  /** Set shininess (marks material for GPU update) */
  set shininess(value: number) {
    this._shininess = value;
    this.needsUpdate = true;
  }

  /** Get specular intensity */
  get specularIntensity(): number {
    return this._specularIntensity;
  }

  /** Set specular intensity (marks material for GPU update) */
  set specularIntensity(value: number) {
    this._specularIntensity = value;
    this.needsUpdate = true;
  }

  /**
   * Create GPU resources (pipeline, bind group, uniform buffer).
   * Call once after device is ready.
   */
  createResources(
    device: GPUDevice,
    format: GPUTextureFormat,
    globalBindGroupLayout: GPUBindGroupLayout
  ): TexturedMaterialResources {
    if (this.resources) {
      return this.resources;
    }

    // Create shader module
    const shaderModule = device.createShaderModule({
      label: `${this.id}-shader`,
      code: shaderSource,
    });

    // Create sampler with trilinear filtering
    this.sampler = device.createSampler({
      label: `${this.id}-sampler`,
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
    });

    // Uniform buffer for color + shininess (32 bytes: vec4 + f32 + padding)
    const uniformBuffer = device.createBuffer({
      label: `${this.id}-uniforms`,
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Write initial uniforms
    const uniformData = new Float32Array(8);
    uniformData.set(this._color, 0);
    uniformData[4] = this._shininess;
    uniformData[5] = this._specularIntensity;
    device.queue.writeBuffer(uniformBuffer, 0, uniformData as unknown as ArrayBuffer);

    // Material bind group layout (group 1): sampler, texture, uniforms
    const materialBindGroupLayout = device.createBindGroupLayout({
      label: `${this.id}-bindGroupLayout`,
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    // Material bind group
    const bindGroup = device.createBindGroup({
      label: `${this.id}-bindGroup`,
      layout: materialBindGroupLayout,
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.texture.createView() },
        { binding: 2, resource: { buffer: uniformBuffer } },
      ],
    });

    // Model bind group layout (group 2)
    const modelBindGroupLayout = device.createBindGroupLayout({
      label: 'model-bindGroupLayout',
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      }],
    });

    // Pipeline layout with all three groups
    const pipelineLayout = device.createPipelineLayout({
      label: `${this.id}-pipelineLayout`,
      bindGroupLayouts: [globalBindGroupLayout, materialBindGroupLayout, modelBindGroupLayout],
    });

    // Render pipeline (with UV attribute)
    const pipeline = device.createRenderPipeline({
      label: `${this.id}-pipeline`,
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [
          // Position buffer (slot 0)
          {
            arrayStride: 12,
            attributes: [{
              shaderLocation: 0,
              offset: 0,
              format: 'float32x3',
            }],
          },
          // Normal buffer (slot 1)
          {
            arrayStride: 12,
            attributes: [{
              shaderLocation: 1,
              offset: 0,
              format: 'float32x3',
            }],
          },
          // UV buffer (slot 2)
          {
            arrayStride: 8,
            attributes: [{
              shaderLocation: 2,
              offset: 0,
              format: 'float32x2',
            }],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });

    this.resources = { pipeline, bindGroup, uniformBuffer, modelBindGroupLayout };
    this.needsUpdate = false;

    return this.resources;
  }

  /**
   * Update GPU uniform buffer if material properties changed.
   */
  updateUniforms(device: GPUDevice): void {
    if (!this.resources || !this.needsUpdate) return;

    const uniformData = new Float32Array(8);
    uniformData.set(this._color, 0);
    uniformData[4] = this._shininess;
    uniformData[5] = this._specularIntensity;

    device.queue.writeBuffer(
      this.resources.uniformBuffer,
      0,
      uniformData as unknown as ArrayBuffer
    );
    this.needsUpdate = false;
  }

  /** Check if GPU resources have been created */
  get hasResources(): boolean {
    return this.resources !== null;
  }

  /** Destroy GPU resources */
  destroyResources(): void {
    if (this.resources) {
      this.resources.uniformBuffer.destroy();
      this.resources = null;
    }
    // Note: texture is managed externally and not destroyed here
  }
}

/**
 * Create a GPU texture from an image (ImageBitmap or HTMLImageElement).
 * Generates mipmaps automatically.
 */
export async function createTextureFromImage(
  device: GPUDevice,
  image: ImageBitmap | HTMLImageElement,
  label?: string
): Promise<GPUTexture> {
  // Convert HTMLImageElement to ImageBitmap if needed
  let bitmap: ImageBitmap;
  if (image instanceof HTMLImageElement) {
    bitmap = await createImageBitmap(image);
  } else {
    bitmap = image;
  }

  const { width, height } = bitmap;

  // Calculate mip level count
  const mipLevelCount = Math.floor(Math.log2(Math.max(width, height))) + 1;

  // Create texture with mip levels (using sRGB for correct color space handling)
  const texture = device.createTexture({
    label: label ?? 'texture',
    size: { width, height },
    mipLevelCount,
    format: 'rgba8unorm-srgb',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  // Copy image to texture (mip level 0)
  device.queue.copyExternalImageToTexture(
    { source: bitmap },
    { texture },
    { width, height }
  );

  // Generate mipmaps using the GPU
  await generateMipmaps(device, texture, width, height, mipLevelCount);

  return texture;
}

/**
 * Generate mipmaps for a texture using GPU blit operations.
 */
async function generateMipmaps(
  device: GPUDevice,
  texture: GPUTexture,
  width: number,
  height: number,
  mipLevelCount: number
): Promise<void> {
  // Create a simple blit shader for downsampling
  const shaderModule = device.createShaderModule({
    label: 'mipmap-shader',
    code: `
      @group(0) @binding(0) var srcTexture: texture_2d<f32>;
      @group(0) @binding(1) var srcSampler: sampler;

      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>,
      }

      @vertex
      fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        var positions = array<vec2<f32>, 3>(
          vec2(-1.0, -1.0),
          vec2(3.0, -1.0),
          vec2(-1.0, 3.0)
        );
        var uvs = array<vec2<f32>, 3>(
          vec2(0.0, 1.0),
          vec2(2.0, 1.0),
          vec2(0.0, -1.0)
        );

        var output: VertexOutput;
        output.position = vec4(positions[vertexIndex], 0.0, 1.0);
        output.uv = uvs[vertexIndex];
        return output;
      }

      @fragment
      fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
        return textureSample(srcTexture, srcSampler, uv);
      }
    `,
  });

  const sampler = device.createSampler({
    minFilter: 'linear',
    magFilter: 'linear',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    ],
  });

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: { module: shaderModule, entryPoint: 'vs_main' },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{ format: 'rgba8unorm-srgb' }],
    },
    primitive: { topology: 'triangle-list' },
  });

  const commandEncoder = device.createCommandEncoder({ label: 'mipmap-encoder' });

  let mipWidth = width;
  let mipHeight = height;

  for (let level = 1; level < mipLevelCount; level++) {
    mipWidth = Math.max(1, Math.floor(mipWidth / 2));
    mipHeight = Math.max(1, Math.floor(mipHeight / 2));

    const srcView = texture.createView({
      baseMipLevel: level - 1,
      mipLevelCount: 1,
    });

    const dstView = texture.createView({
      baseMipLevel: level,
      mipLevelCount: 1,
    });

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: srcView },
        { binding: 1, resource: sampler },
      ],
    });

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: dstView,
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }

  device.queue.submit([commandEncoder.finish()]);
}
