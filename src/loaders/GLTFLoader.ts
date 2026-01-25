/**
 * GLTFLoader: Thin wrapper around @loaders.gl/gltf.
 * Extracts geometry data (positions, normals, UVs, indices) and textures from glTF/GLB files.
 */

import { load } from '@loaders.gl/core';
import { GLTFLoader as LoadersGLTFLoader, postProcessGLTF } from '@loaders.gl/gltf';
import type { GLTFPostprocessed, GLTFMeshPrimitivePostprocessed, GLTFMaterialPostprocessed } from '@loaders.gl/gltf';
import { Geometry } from '@/geometry/Geometry';
import { Mesh } from '@/objects/Mesh';
import { SolidMaterial } from '@/materials/SolidMaterial';
import { TexturedMaterial, createTextureFromImage } from '@/materials/TexturedMaterial';
import type { Color } from '@/types';

/** Loaded texture information */
export interface LoadedTexture {
  /** Image data (ImageBitmap or HTMLImageElement) */
  image: ImageBitmap | HTMLImageElement;
  /** Original image URI */
  uri?: string | undefined;
}

/** Options for loading glTF files */
export interface GLTFLoadOptions {
  /** Default material color if model has no materials (default: gray) */
  defaultColor?: Color | undefined;
  /** GPU device for creating textures (required for textured models) */
  device?: GPUDevice | undefined;
  /** Specular intensity for textured materials (0 = no specular, 1 = full) (default: 1) */
  specularIntensity?: number | undefined;
}

/** Result of loading a glTF file */
export interface GLTFLoadResult {
  /** All meshes extracted from the model */
  meshes: Mesh[];
  /** Loaded textures (if loadImages was true) */
  textures: LoadedTexture[];
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
    const device = options?.device;
    const specularIntensity = options?.specularIntensity ?? 1.0;

    // Load glTF using loaders.gl (with images enabled for textures)
    const gltfWithBuffers = await load(url, LoadersGLTFLoader, {
      gltf: {
        loadBuffers: true,
        loadImages: true,
      },
    });

    // Post-process to resolve references and create typed arrays
    const gltf = postProcessGLTF(gltfWithBuffers) as GLTFPostprocessed;

    // Extract textures from loaded images
    const textures: LoadedTexture[] = [];
    const gpuTextures: Map<number, GPUTexture> = new Map();
    
    if (gltf.images) {
      for (let i = 0; i < gltf.images.length; i++) {
        const image = gltf.images[i]!;
        // loaders.gl provides the image data in the 'image' property
        const imageData = (image as unknown as { image?: ImageBitmap | HTMLImageElement }).image;
        if (imageData) {
          textures.push({
            image: imageData,
            uri: image.uri,
          });
          
          // Create GPU texture if device is provided
          if (device) {
            const gpuTexture = await createTextureFromImage(device, imageData, image.uri);
            gpuTextures.set(i, gpuTexture);
          }
        }
      }
    }

    const meshes: Mesh[] = [];

    // Extract meshes from the loaded glTF
    if (gltf.meshes) {
      for (const gltfMesh of gltf.meshes) {
        for (const primitive of gltfMesh.primitives || []) {
          // Get material info for this primitive
          const materialInfo = primitive.material as GLTFMaterialPostprocessed | undefined;
          const textureIndex = this.getBaseColorTextureIndex(materialInfo);
          const loadedTexture = textureIndex !== null && textureIndex < textures.length
            ? textures[textureIndex]
            : null;
          const gpuTexture = textureIndex !== null ? gpuTextures.get(textureIndex) : undefined;

          const mesh = this.extractMesh(primitive, color, loadedTexture, gpuTexture, specularIntensity);
          if (mesh) {
            meshes.push(mesh);
          }
        }
      }
    }

    if (meshes.length === 0) {
      throw new Error(`No meshes found in glTF file: ${url}`);
    }

    console.info(`[LunaVis] Loaded ${meshes.length} mesh(es), ${textures.length} texture(s) from ${url}`);

    return {
      meshes,
      textures,
      name: gltf.asset?.generator,
    };
  }

  /**
   * Get the base color texture index from a glTF material.
   */
  private getBaseColorTextureIndex(material: GLTFMaterialPostprocessed | undefined): number | null {
    if (!material) return null;
    const pbr = material.pbrMetallicRoughness;
    if (!pbr) return null;
    const textureInfo = pbr.baseColorTexture;
    if (!textureInfo) return null;
    // textureInfo.index points to gltf.textures[index], which has a source property
    // pointing to gltf.images[source]. For simplicity, we assume source === index.
    return textureInfo.index ?? null;
  }

  /**
   * Extract a Mesh from a glTF primitive.
   */
  private extractMesh(
    primitive: GLTFMeshPrimitivePostprocessed,
    color: Color,
    texture: LoadedTexture | null = null,
    gpuTexture?: GPUTexture,
    specularIntensity = 1.0
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

    // Get UVs (optional)
    let uvs: Float32Array | undefined;
    const uvAccessor = attributes['TEXCOORD_0'];
    if (uvAccessor?.value) {
      uvs = new Float32Array(uvAccessor.value);
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

    // Create geometry (with UVs if present)
    const geometryData = uvs
      ? { positions, normals, uvs, indices }
      : { positions, normals, indices };
    const geometry = new Geometry(geometryData);

    // Create appropriate material based on whether we have a GPU texture
    let material: SolidMaterial | TexturedMaterial;
    if (gpuTexture && uvs) {
      // Use textured material when we have both a texture and UVs
      material = new TexturedMaterial(gpuTexture, { color, shininess: 32, specularIntensity });
    } else {
      // Fall back to solid material
      material = new SolidMaterial({ color, shininess: 32 });
    }

    const mesh = new Mesh(geometry, material);

    // Store texture reference for debugging/later use
    if (texture) {
      (mesh as Mesh & { _loadedTexture?: LoadedTexture })._loadedTexture = texture;
    }

    return mesh;
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
