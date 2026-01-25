/**
 * NodeData: GPU-ready terrain node data for instanced rendering.
 *
 * Matches the WGSL struct layout used by the terrain vertex shader.
 * Total size: 32 bytes per node, 16-byte aligned.
 *
 * WGSL struct:
 * ```wgsl
 * struct NodeData {
 *     relativeOrigin: vec3<f32>,  // 12 bytes (offset 0)
 *     scale: f32,                  // 4 bytes  (offset 12)
 *     lodLevel: u32,               // 4 bytes  (offset 16)
 *     faceId: u32,                 // 4 bytes  (offset 20)
 *     morphStart: f32,             // 4 bytes  (offset 24)
 *     morphEnd: f32,               // 4 bytes  (offset 28)
 * };
 * ```
 */

import type { FaceId } from '@/types';

/** Size of a single NodeData struct in bytes */
export const NODE_DATA_SIZE = 32;

/** Number of 32-bit values per NodeData struct */
export const NODE_DATA_FLOATS = 8;

/**
 * GPU-ready node data for instanced terrain rendering.
 *
 * For M11 (flat cube patches), relativeOrigin stores the UV origin
 * on the cube face as (u, v, 0). Later milestones can repurpose this
 * field for RTE positions as the sphere projection is introduced.
 */
export interface NodeData {
  /**
   * Node UV origin on the cube face (u, v, 0) for flat patch placement.
   */
  readonly relativeOrigin: readonly [number, number, number];

  /**
   * Node size in normalized cube-face coordinates (0-1).
   * Root nodes have size = 1.0, each subdivision halves it.
   */
  readonly scale: number;

  /**
   * LOD level (0 = root/coarsest, higher = finer detail).
   * Used for mipmap selection in heightmap sampling.
   */
  readonly lodLevel: number;

  /**
   * Cube face ID (0-5).
   * Determines UV-to-cube-direction mapping in shader.
   */
  readonly faceId: FaceId;

  /**
   * Distance where vertex morphing begins.
   * When camera distance > morphStart, vertices start blending
   * toward their parent positions.
   */
  readonly morphStart: number;

  /**
   * Distance where morphing completes (LOD switch point).
   * At this distance, vertices have fully collapsed to parent positions
   * and the node can be replaced by its parent.
   */
  readonly morphEnd: number;
}

/**
 * Pack an array of NodeData into a Float32Array for GPU upload.
 *
 * The resulting buffer can be uploaded to a GPUBuffer with usage STORAGE.
 *
 * @param nodes - Array of NodeData to pack
 * @returns Float32Array ready for GPU upload
 */
export function packNodeData(nodes: readonly NodeData[]): Float32Array {
  const arrayBuffer = new ArrayBuffer(nodes.length * NODE_DATA_SIZE);
  const buffer = new Float32Array(arrayBuffer);
  const bufferU32 = new Uint32Array(arrayBuffer);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const offset = i * NODE_DATA_FLOATS;

    // relativeOrigin: vec3<f32> (12 bytes)
    buffer[offset + 0] = node.relativeOrigin[0];
    buffer[offset + 1] = node.relativeOrigin[1];
    buffer[offset + 2] = node.relativeOrigin[2];

    // scale: f32 (4 bytes)
    buffer[offset + 3] = node.scale;

    // lodLevel: u32 (4 bytes)
    bufferU32[offset + 4] = node.lodLevel >>> 0;

    // faceId: u32 (4 bytes)
    bufferU32[offset + 5] = node.faceId >>> 0;

    // morphStart: f32 (4 bytes)
    buffer[offset + 6] = node.morphStart;

    // morphEnd: f32 (4 bytes)
    buffer[offset + 7] = node.morphEnd;
  }

  return buffer;
}

/**
 * Pack an array of NodeData into a pre-allocated Float32Array.
 *
 * Useful for avoiding allocations in the render loop.
 *
 * @param nodes - Array of NodeData to pack
 * @param buffer - Pre-allocated buffer (must be >= nodes.length * NODE_DATA_FLOATS)
 * @param offset - Starting offset in the buffer (in float32 elements)
 * @returns Number of float32 elements written
 */
export function packNodeDataInto(
  nodes: readonly NodeData[],
  buffer: Float32Array,
  offset: number = 0
): number {
  const bufferU32 = new Uint32Array(buffer.buffer, buffer.byteOffset, buffer.length);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const idx = offset + i * NODE_DATA_FLOATS;

    buffer[idx + 0] = node.relativeOrigin[0];
    buffer[idx + 1] = node.relativeOrigin[1];
    buffer[idx + 2] = node.relativeOrigin[2];
    buffer[idx + 3] = node.scale;
    bufferU32[idx + 4] = node.lodLevel >>> 0;
    bufferU32[idx + 5] = node.faceId >>> 0;
    buffer[idx + 6] = node.morphStart;
    buffer[idx + 7] = node.morphEnd;
  }

  return nodes.length * NODE_DATA_FLOATS;
}

/**
 * Unpack a Float32Array back into NodeData array.
 *
 * Useful for debugging and testing.
 *
 * @param buffer - Packed Float32Array
 * @param count - Number of nodes to unpack
 * @returns Array of NodeData
 */
export function unpackNodeData(buffer: Float32Array, count: number): NodeData[] {
  const bufferU32 = new Uint32Array(buffer.buffer, buffer.byteOffset, buffer.length);
  const nodes: NodeData[] = [];

  for (let i = 0; i < count; i++) {
    const offset = i * NODE_DATA_FLOATS;

    nodes.push({
      relativeOrigin: [
        buffer[offset + 0]!,
        buffer[offset + 1]!,
        buffer[offset + 2]!,
      ],
      scale: buffer[offset + 3]!,
      lodLevel: bufferU32[offset + 4]!,
      faceId: bufferU32[offset + 5]! as FaceId,
      morphStart: buffer[offset + 6]!,
      morphEnd: buffer[offset + 7]!,
    });
  }

  return nodes;
}

/**
 * Create a NodeData object.
 *
 * Helper for constructing NodeData with proper typing.
 */
export function createNodeData(
  relativeOrigin: readonly [number, number, number],
  scale: number,
  lodLevel: number,
  faceId: FaceId,
  morphStart: number,
  morphEnd: number
): NodeData {
  return {
    relativeOrigin,
    scale,
    lodLevel,
    faceId,
    morphStart,
    morphEnd,
  };
}
