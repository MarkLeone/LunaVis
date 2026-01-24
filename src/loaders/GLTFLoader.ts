/**
 * GLTFLoader: Thin wrapper around @loaders.gl/gltf.
 * Extracts geometry data (positions, normals, indices) from glTF/GLB files.
 */

import { load } from '@loaders.gl/core';
import { GLTFLoader as LoadersGLTFLoader, postProcessGLTF } from '@loaders.gl/gltf';
import type { GLTFPostprocessed, GLTFMeshPrimitivePostprocessed } from '@loaders.gl/gltf';
import { Geometry } from '@/geometry/Geometry';
import { Mesh } from '@/objects/Mesh';
import { SolidMaterial } from '@/materials/SolidMaterial';
import type { Color } from '@/types';

/** Options for loading glTF files */
export interface GLTFLoadOptions {
  /** Default material color if model has no materials (default: gray) */
  defaultColor?: Color;
}

/** Result of loading a glTF file */
export interface GLTFLoadResult {
  /** All meshes extracted from the model */
  meshes: Mesh[];
  /** Scene name if present */
  name?: string | undefined;
}

/**
 * Load a glTF/GLB file and extract meshes.
 *
 * @example
 * ```ts
 * const loader = new GLTFLoader();
 * const result = await loader.load('/assets/Duck.glb');
 * for (const mesh of result.meshes) {
 *   viewer.addMesh(mesh);
 * }
 * ```
 */
export class GLTFLoader {
  private defaultColor: Color = [0.7, 0.7, 0.7, 1.0];

  /**
   * Load a glTF/GLB file from URL.
   */
  async load(url: string, options?: GLTFLoadOptions): Promise<GLTFLoadResult> {
    const color = options?.defaultColor ?? this.defaultColor;

    // Load glTF using loaders.gl
    const gltfWithBuffers = await load(url, LoadersGLTFLoader, {
      gltf: {
        loadBuffers: true,
        loadImages: false, // We don't support textures yet
      },
    });

    // Post-process to resolve references and create typed arrays
    const gltf = postProcessGLTF(gltfWithBuffers) as GLTFPostprocessed;

    const meshes: Mesh[] = [];

    // Extract meshes from the loaded glTF
    if (gltf.meshes) {
      for (const gltfMesh of gltf.meshes) {
        for (const primitive of gltfMesh.primitives || []) {
          const mesh = this.extractMesh(primitive, color);
          if (mesh) {
            meshes.push(mesh);
          }
        }
      }
    }

    if (meshes.length === 0) {
      throw new Error(`No meshes found in glTF file: ${url}`);
    }

    console.info(`[LunaVis] Loaded ${meshes.length} mesh(es) from ${url}`);

    return {
      meshes,
      name: gltf.asset?.generator,
    };
  }

  /**
   * Extract a Mesh from a glTF primitive.
   */
  private extractMesh(
    primitive: GLTFMeshPrimitivePostprocessed,
    color: Color
  ): Mesh | null {
    const attributes = primitive.attributes;
    if (!attributes) {
      console.warn('[GLTFLoader] Primitive has no attributes');
      return null;
    }

    // Get positions (required)
    const positionAccessor = attributes['POSITION'];
    if (!positionAccessor?.value) {
      console.warn('[GLTFLoader] Primitive has no POSITION attribute');
      return null;
    }
    const positions = new Float32Array(positionAccessor.value);

    // Get normals (optional - generate flat normals if missing)
    let normals: Float32Array;
    const normalAccessor = attributes['NORMAL'];
    if (normalAccessor?.value) {
      normals = new Float32Array(normalAccessor.value);
    } else {
      console.warn('[GLTFLoader] No normals, generating flat normals');
      normals = this.generateFlatNormals(positions, primitive.indices?.value);
    }

    // Get indices (optional - generate sequential if missing)
    let indices: Uint16Array | Uint32Array;
    if (primitive.indices?.value) {
      const indexData = primitive.indices.value;
      // Use Uint32 if any index exceeds Uint16 range
      const maxIndex = Math.max(...Array.from(indexData));
      if (maxIndex > 65535) {
        indices = new Uint32Array(indexData);
      } else {
        indices = new Uint16Array(indexData);
      }
    } else {
      // No indices - create sequential indices for triangle list
      const vertexCount = positions.length / 3;
      indices = vertexCount > 65535
        ? new Uint32Array(vertexCount).map((_, i) => i)
        : new Uint16Array(vertexCount).map((_, i) => i);
    }

    // Create geometry
    const geometry = new Geometry({ positions, normals, indices });

    // Create material with default color
    // TODO: Extract material properties from glTF if present
    const material = new SolidMaterial({ color, shininess: 32 });

    return new Mesh(geometry, material);
  }

  /**
   * Generate flat normals for a mesh without normals.
   * Each triangle gets a face normal applied to all three vertices.
   */
  private generateFlatNormals(
    positions: Float32Array,
    indices?: ArrayLike<number>
  ): Float32Array {
    const normals = new Float32Array(positions.length);

    const getIndex = indices
      ? (i: number) => indices[i]!
      : (i: number) => i;

    const triangleCount = indices
      ? indices.length / 3
      : positions.length / 9;

    for (let t = 0; t < triangleCount; t++) {
      const i0 = getIndex(t * 3);
      const i1 = getIndex(t * 3 + 1);
      const i2 = getIndex(t * 3 + 2);

      // Get triangle vertices
      const ax = positions[i0 * 3]!, ay = positions[i0 * 3 + 1]!, az = positions[i0 * 3 + 2]!;
      const bx = positions[i1 * 3]!, by = positions[i1 * 3 + 1]!, bz = positions[i1 * 3 + 2]!;
      const cx = positions[i2 * 3]!, cy = positions[i2 * 3 + 1]!, cz = positions[i2 * 3 + 2]!;

      // Compute edges
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;

      // Cross product for normal
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;

      // Normalize
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 0) {
        nx /= len;
        ny /= len;
        nz /= len;
      }

      // Apply to all three vertices
      normals[i0 * 3] = nx; normals[i0 * 3 + 1] = ny; normals[i0 * 3 + 2] = nz;
      normals[i1 * 3] = nx; normals[i1 * 3 + 1] = ny; normals[i1 * 3 + 2] = nz;
      normals[i2 * 3] = nx; normals[i2 * 3 + 1] = ny; normals[i2 * 3 + 2] = nz;
    }

    return normals;
  }
}
