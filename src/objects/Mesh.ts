/**
 * Mesh: Combines Geometry and Material for rendering.
 * Links vertex data with visual appearance.
 */

import type { MeshId } from '@/types';
import { meshId } from '@/types';
import type { Geometry, GeometryBuffers } from '@/geometry/Geometry';
import type { SolidMaterial, MaterialResources } from '@/materials/SolidMaterial';

/**
 * Mesh combining geometry and material for rendering.
 *
 * @example
 * ```ts
 * const mesh = new Mesh(geometry, material);
 * mesh.createGPUResources(device, format);
 * renderer.renderMesh(mesh, renderPass);
 * ```
 */
export class Mesh {
  readonly id: MeshId;
  readonly geometry: Geometry;
  readonly material: SolidMaterial;

  private geometryBuffers: GeometryBuffers | null = null;
  private materialResources: MaterialResources | null = null;

  constructor(geometry: Geometry, material: SolidMaterial) {
    this.id = meshId(`mesh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    this.geometry = geometry;
    this.material = material;
  }

  /**
   * Create all GPU resources for this mesh.
   * Call once after device is ready.
   */
  createGPUResources(device: GPUDevice, format: GPUTextureFormat): void {
    this.geometryBuffers = this.geometry.createBuffers(device);
    this.materialResources = this.material.createResources(device, format);
  }

  /**
   * Render this mesh using the given render pass encoder.
   * Must call createGPUResources() first.
   */
  render(pass: GPURenderPassEncoder, device: GPUDevice): void {
    if (!this.geometryBuffers || !this.materialResources) {
      throw new Error('Mesh GPU resources not created. Call createGPUResources() first.');
    }

    // Update material uniforms if needed
    this.material.updateUniforms(device);

    const { pipeline, bindGroup } = this.materialResources;
    const { positionBuffer, normalBuffer, indexBuffer, indexCount, indexFormat } = this.geometryBuffers;

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, normalBuffer);
    pass.setIndexBuffer(indexBuffer, indexFormat);
    pass.drawIndexed(indexCount);
  }

  /** Check if GPU resources are ready */
  get isReady(): boolean {
    return this.geometryBuffers !== null && this.materialResources !== null;
  }

  /** Destroy all GPU resources */
  destroy(): void {
    this.geometry.destroyBuffers();
    this.material.destroyResources();
    this.geometryBuffers = null;
    this.materialResources = null;
  }
}
