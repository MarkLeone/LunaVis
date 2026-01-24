/**
 * Scene: Root container for the scene graph.
 *
 * Holds all objects to be rendered and provides traversal.
 */

import { Object3D } from '@/objects/Object3D';
import type { Mesh } from '@/objects/Mesh';

/**
 * Scene root container.
 *
 * @example
 * ```ts
 * const scene = new Scene();
 * scene.add(mesh);
 * scene.traverse(obj => console.log(obj.id));
 * ```
 */
export class Scene extends Object3D {
  /**
   * Get all meshes in the scene (flattened).
   * Traverses the scene graph and collects Mesh instances.
   */
  getMeshes(): Mesh[] {
    const meshes: Mesh[] = [];
    this.traverse((obj) => {
      // Check if object is a Mesh (has geometry and material)
      if ('geometry' in obj && 'material' in obj) {
        meshes.push(obj as Mesh);
      }
    });
    return meshes;
  }

  /**
   * Remove all children from the scene and destroy their GPU resources.
   */
  clear(): void {
    const meshes = this.getMeshes();
    for (const mesh of meshes) {
      this.remove(mesh);
      mesh.destroy();
    }
  }
}
