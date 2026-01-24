/**
 * SolidMaterial: Flat color material with MVP transforms.
 * Creates render pipeline and bind groups for solid color rendering.
 *
 * Bind Group Layout:
 * - Group 0: Global uniforms (camera view-projection matrix)
 * - Group 1: Material uniforms (color)
 * - Group 2: Object uniforms (model matrix) - managed by Mesh
 */

import type { MaterialId, Color } from '@/types';
import { materialId } from '@/types';
import shaderSource from '@/shaders/solid.wgsl?raw';

/** Material configuration */
export interface SolidMaterialOptions {
  /** RGBA color (0-1 range) */
  color: Color;
}

/** GPU resources for a material */
export interface MaterialResources {
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
}

/**
 * Solid color material for basic rendering.
 *
 * @example
 * ```ts
 * const material = new SolidMaterial({ color: [1, 0, 0, 1] }); // Red
 * const resources = material.createResources(device, format, globalBindGroupLayout);
 * ```
 */
export class SolidMaterial {
  readonly id: MaterialId;
  private _color: Color;
  private resources: MaterialResources | null = null;
  private needsUpdate = true;

  constructor(options: SolidMaterialOptions) {
    this.id = materialId(`mat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    this._color = options.color;
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

    // Uniform buffer for color (16 bytes for vec4)
    const uniformBuffer = device.createBuffer({
      label: `${this.id}-uniforms`,
      size: 16, // vec4<f32>
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Write initial color
    device.queue.writeBuffer(uniformBuffer, 0, new Float32Array(this._color) as unknown as ArrayBuffer);

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
        cullMode: 'back',
        frontFace: 'ccw',
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });

    this.resources = { pipeline, bindGroup, uniformBuffer };
    this.needsUpdate = false;

    return this.resources;
  }

  /**
   * Update GPU uniform buffer if color has changed.
   * Call before rendering if material properties changed.
   */
  updateUniforms(device: GPUDevice): void {
    if (!this.resources || !this.needsUpdate) return;

    device.queue.writeBuffer(
      this.resources.uniformBuffer,
      0,
      new Float32Array(this._color) as unknown as ArrayBuffer
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
