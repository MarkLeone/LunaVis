/**
 * SolidMaterial: Blinn-Phong lit material.
 * Creates render pipeline and bind groups for lit rendering.
 *
 * Bind Group Layout:
 * - Group 0: Global uniforms (camera + light)
 * - Group 1: Material uniforms (color, shininess)
 * - Group 2: Object uniforms (model matrix) - managed by Mesh
 */

import type { MaterialId, Color } from '@/types';
import { materialId } from '@/types';
import shaderSource from '@/shaders/blinn-phong.wgsl?raw';

/** Material configuration */
export interface SolidMaterialOptions {
  /** RGBA color (0-1 range) */
  color: Color;
  /** Specular shininess exponent (default: 32) */
  shininess?: number;
}

/** GPU resources for a material */
export interface MaterialResources {
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  modelBindGroupLayout: GPUBindGroupLayout;
}

/**
 * Blinn-Phong lit material.
 *
 * @example
 * ```ts
 * const material = new SolidMaterial({ color: [1, 0, 0, 1], shininess: 32 });
 * const resources = material.createResources(device, format, globalBindGroupLayout);
 * ```
 */
export class SolidMaterial {
  readonly id: MaterialId;
  private _color: Color;
  private _shininess: number;
  private resources: MaterialResources | null = null;
  private needsUpdate = true;

  constructor(options: SolidMaterialOptions) {
    this.id = materialId(`mat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    this._color = options.color;
    this._shininess = options.shininess ?? 32;
  }

  /** Get current color */
  get color(): Color {
    return this._color;
  }

  /** Set color (marks material for GPU update) */
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

  /**
   * Create the bind group layouts used by this material's pipeline.
   * Static method so Viewer can create matching layouts.
   */
  static createBindGroupLayouts(device: GPUDevice): {
    globalLayout: GPUBindGroupLayout;
    materialLayout: GPUBindGroupLayout;
    modelLayout: GPUBindGroupLayout;
  } {
    // Group 0: Global uniforms (view-projection matrix)
    const globalLayout = device.createBindGroupLayout({
      label: 'global-bindGroupLayout',
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      }],
    });

    // Group 1: Material uniforms (color)
    const materialLayout = device.createBindGroupLayout({
      label: 'material-bindGroupLayout',
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      }],
    });

    // Group 2: Object uniforms (model matrix)
    const modelLayout = device.createBindGroupLayout({
      label: 'model-bindGroupLayout',
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      }],
    });

    return { globalLayout, materialLayout, modelLayout };
  }

  /**
   * Create GPU resources (pipeline, bind group, uniform buffer).
   * Call once after device is ready.
   */
  createResources(
    device: GPUDevice,
    format: GPUTextureFormat,
    globalBindGroupLayout: GPUBindGroupLayout
  ): MaterialResources {
    if (this.resources) {
      return this.resources;
    }

    // Create shader module
    const shaderModule = device.createShaderModule({
      label: `${this.id}-shader`,
      code: shaderSource,
    });

    // Uniform buffer for color + shininess (32 bytes: vec4 + f32 + vec3 padding)
    const uniformBuffer = device.createBuffer({
      label: `${this.id}-uniforms`,
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Write initial uniforms
    const uniformData = new Float32Array(8); // 32 bytes
    uniformData.set(this._color, 0);          // color: vec4 at offset 0
    uniformData[4] = this._shininess;          // shininess: f32 at offset 16
    device.queue.writeBuffer(uniformBuffer, 0, uniformData as unknown as ArrayBuffer);

    // Material bind group layout (group 1)
    const materialBindGroupLayout = device.createBindGroupLayout({
      label: `${this.id}-bindGroupLayout`,
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      }],
    });

    // Material bind group
    const bindGroup = device.createBindGroup({
      label: `${this.id}-bindGroup`,
      layout: materialBindGroupLayout,
      entries: [{
        binding: 0,
        resource: { buffer: uniformBuffer },
      }],
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

    // Render pipeline
    const pipeline = device.createRenderPipeline({
      label: `${this.id}-pipeline`,
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [
          // Position buffer
          {
            arrayStride: 12, // 3 floats × 4 bytes
            attributes: [{
              shaderLocation: 0,
              offset: 0,
              format: 'float32x3',
            }],
          },
          // Normal buffer
          {
            arrayStride: 12,
            attributes: [{
              shaderLocation: 1,
              offset: 0,
              format: 'float32x3',
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
        cullMode: 'none',  // Disable culling for debugging
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
   * Call before rendering if material properties changed.
   */
  updateUniforms(device: GPUDevice): void {
    if (!this.resources || !this.needsUpdate) return;

    const uniformData = new Float32Array(8); // 32 bytes
    uniformData.set(this._color, 0);
    uniformData[4] = this._shininess;

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
  }
}
