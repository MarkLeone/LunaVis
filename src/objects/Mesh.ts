/**
 * Mesh: Combines Geometry and Material for rendering.
 * Extends Object3D for transform hierarchy support.
 */

import type { MeshId } from '@/types';
import { meshId } from '@/types';
import type { Geometry, GeometryBuffers } from '@/geometry/Geometry';
import type { SolidMaterial, MaterialResources } from '@/materials/SolidMaterial';
import type { TexturedMaterial, TexturedMaterialResources } from '@/materials/TexturedMaterial';
import { Object3D } from './Object3D';

/** Union type for supported materials */
export type MeshMaterial = SolidMaterial | TexturedMaterial;

/** Union type for material resources */
type AnyMaterialResources = MaterialResources | TexturedMaterialResources;

/** GPU resources specific to a mesh instance */
export interface MeshResources {
  /** Model matrix uniform buffer */
  modelBuffer: GPUBuffer;
  /** Bind group for per-object uniforms */
  modelBindGroup: GPUBindGroup;
}

/**
 * Mesh combining geometry and material for rendering.
 * Extends Object3D for position, rotation, scale.
 *
 * @example
 * ```ts
 * const mesh = new Mesh(geometry, material);
 * mesh.position = [1, 0, 0];
 * mesh.createGPUResources(device, format, globalBindGroupLayout);
 * ```
 */
export class Mesh extends Object3D {
  readonly meshId: MeshId;
  readonly geometry: Geometry;
  readonly material: MeshMaterial;

  private geometryBuffers: GeometryBuffers | null = null;
  private materialResources: AnyMaterialResources | null = null;
  private meshResources: MeshResources | null = null;

  constructor(geometry: Geometry, material: MeshMaterial) {
    super();
    this.meshId = meshId(`mesh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    this.geometry = geometry;
    this.material = material;
  }

  /**
   * Create all GPU resources for this mesh.
   * Call once after device is ready.
   */
  createGPUResources(
    device: GPUDevice,
    format: GPUTextureFormat,
    globalBindGroupLayout: GPUBindGroupLayout
  ): void {
    this.geometryBuffers = this.geometry.createBuffers(device);
    this.materialResources = this.material.createResources(device, format, globalBindGroupLayout);

    // Create model matrix buffer (64 bytes for mat4x4)
    const modelBuffer = device.createBuffer({
      label: `${this.meshId}-model`,
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Write initial model matrix
    device.queue.writeBuffer(modelBuffer, 0, this.worldMatrix as unknown as ArrayBuffer);

    // Create bind group for model matrix using layout from material's pipeline
    const modelBindGroup = device.createBindGroup({
      label: `${this.meshId}-modelBindGroup`,
      layout: this.materialResources.modelBindGroupLayout,
      entries: [{
        binding: 0,
        resource: { buffer: modelBuffer },
      }],
    });

    this.meshResources = { modelBuffer, modelBindGroup };
  }

  /**
   * Update model matrix uniform buffer.
   * Call before rendering if transform changed.
   */
  updateModelMatrix(device: GPUDevice): void {
    if (!this.meshResources) return;
    device.queue.writeBuffer(
      this.meshResources.modelBuffer,
      0,
      this.worldMatrix as unknown as ArrayBuffer
    );
  }

  /**
   * Render this mesh using the given render pass encoder.
   * Must call createGPUResources() first.
   */
  render(pass: GPURenderPassEncoder, device: GPUDevice, globalBindGroup: GPUBindGroup): void {
    if (!this.geometryBuffers || !this.materialResources || !this.meshResources) {
      throw new Error('Mesh GPU resources not created. Call createGPUResources() first.');
    }

    // Update uniforms
    this.material.updateUniforms(device);
    this.updateModelMatrix(device);

    const { pipeline, bindGroup: materialBindGroup } = this.materialResources;
    const { positionBuffer, normalBuffer, uvBuffer, indexBuffer, indexCount, indexFormat } = this.geometryBuffers;
    const { modelBindGroup } = this.meshResources;

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, globalBindGroup);      // Camera/light uniforms
    pass.setBindGroup(1, materialBindGroup);    // Material uniforms
    pass.setBindGroup(2, modelBindGroup);       // Model matrix
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, normalBuffer);
    
    // Set UV buffer if geometry has UVs (required for textured materials)
    if (uvBuffer) {
      pass.setVertexBuffer(2, uvBuffer);
    }
    
    pass.setIndexBuffer(indexBuffer, indexFormat);
    pass.drawIndexed(indexCount);
  }

  /** Check if GPU resources are ready */
  get isReady(): boolean {
    return this.geometryBuffers !== null &&
           this.materialResources !== null &&
           this.meshResources !== null;
  }

  /** Destroy all GPU resources */
  destroy(): void {
    this.geometry.destroyBuffers();
    this.material.destroyResources();
    if (this.meshResources) {
      this.meshResources.modelBuffer.destroy();
      this.meshResources = null;
    }
    this.geometryBuffers = null;
    this.materialResources = null;
  }
}
