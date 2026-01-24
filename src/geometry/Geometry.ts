/**
 * Geometry: CPU-side vertex data and GPU buffer management.
 *
 * Stores positions, normals, and indices. Creates GPU buffers on demand.
 * Designed for immutable geometry — create once, render many times.
 */

import type { GeometryId } from '@/types';
import { geometryId } from '@/types';

/** Vertex attribute data for geometry */
export interface GeometryData {
  /** Vertex positions (3 floats per vertex: x, y, z) */
  positions: Float32Array;
  /** Vertex normals (3 floats per vertex: nx, ny, nz) */
  normals: Float32Array;
  /** Triangle indices (3 indices per triangle) */
  indices: Uint16Array | Uint32Array;
}

/** GPU resources created from geometry data */
export interface GeometryBuffers {
  positionBuffer: GPUBuffer;
  normalBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
  indexFormat: GPUIndexFormat;
}

/**
 * Geometry class holding vertex data and GPU buffers.
 *
 * @example
 * ```ts
 * const geo = new Geometry({
 *   positions: new Float32Array([0, 0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 0]),
 *   normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
 *   indices: new Uint16Array([0, 1, 2]),
 * });
 * const buffers = geo.createBuffers(device);
 * ```
 */
export class Geometry {
  readonly id: GeometryId;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly vertexCount: number;
  readonly indexCount: number;

  private gpuBuffers: GeometryBuffers | null = null;

  constructor(data: GeometryData) {
    this.id = geometryId(`geo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    this.positions = data.positions;
    this.normals = data.normals;
    this.indices = data.indices;
    this.vertexCount = data.positions.length / 3;
    this.indexCount = data.indices.length;

    // Validate data
    if (data.positions.length !== data.normals.length) {
      throw new Error('Positions and normals must have same length');
    }
    if (data.positions.length % 3 !== 0) {
      throw new Error('Positions must have 3 components per vertex');
    }
  }

  /**
   * Create GPU buffers from geometry data.
   * Buffers are cached — subsequent calls return the same buffers.
   */
  createBuffers(device: GPUDevice): GeometryBuffers {
    if (this.gpuBuffers) {
      return this.gpuBuffers;
    }

    // Position buffer
    const positionBuffer = device.createBuffer({
      label: `${this.id}-positions`,
      size: this.positions.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(positionBuffer, 0, this.positions as unknown as ArrayBuffer);

    // Normal buffer
    const normalBuffer = device.createBuffer({
      label: `${this.id}-normals`,
      size: this.normals.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(normalBuffer, 0, this.normals as unknown as ArrayBuffer);

    // Index buffer — use uint32 if indices exceed uint16 range
    const indexFormat: GPUIndexFormat = this.indices instanceof Uint32Array ? 'uint32' : 'uint16';
    // Buffer size must be aligned to 4 bytes for writeBuffer
    const indexByteSize = Math.ceil(this.indices.byteLength / 4) * 4;
    const indexBuffer = device.createBuffer({
      label: `${this.id}-indices`,
      size: indexByteSize,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    // Pad index data to 4-byte alignment if needed
    if (this.indices.byteLength % 4 !== 0) {
      const paddedArray = new Uint8Array(indexByteSize);
      paddedArray.set(new Uint8Array(this.indices.buffer, this.indices.byteOffset, this.indices.byteLength));
      device.queue.writeBuffer(indexBuffer, 0, paddedArray as unknown as ArrayBuffer);
    } else {
      device.queue.writeBuffer(indexBuffer, 0, this.indices as unknown as ArrayBuffer);
    }

    this.gpuBuffers = {
      positionBuffer,
      normalBuffer,
      indexBuffer,
      indexCount: this.indexCount,
      indexFormat,
    };

    return this.gpuBuffers;
  }

  /** Check if GPU buffers have been created */
  get hasBuffers(): boolean {
    return this.gpuBuffers !== null;
  }

  /** Destroy GPU buffers to free memory */
  destroyBuffers(): void {
    if (this.gpuBuffers) {
      this.gpuBuffers.positionBuffer.destroy();
      this.gpuBuffers.normalBuffer.destroy();
      this.gpuBuffers.indexBuffer.destroy();
      this.gpuBuffers = null;
    }
  }
}
