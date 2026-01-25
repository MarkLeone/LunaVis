/**
 * Terrain module: CDLOD quadtree-based terrain rendering system.
 *
 * Provides:
 * - QuadTree/QuadNode: Spherified cube quadtree data structure
 * - LODSelector: CPU-side LOD selection with frustum culling
 * - Frustum: View frustum for culling
 * - NodeData: GPU-ready node data for instanced rendering
 */

// Core quadtree
export { QuadTree, type QuadTreeStats, type TraversalCallback, type TraversalPredicate } from './QuadTree';
export { QuadNode, Quadrant, type BoundingSphere, type QuadNodeOptions } from './QuadNode';

// LOD selection
export { LODSelector, type LODConfig, type LODRange, type LODSelectionStats } from './LODSelector';
export { Frustum, FrustumPlaneIndex, type FrustumPlane } from './Frustum';

// GPU data
export {
  type NodeData,
  NODE_DATA_SIZE,
  NODE_DATA_FLOATS,
  packNodeData,
  packNodeDataInto,
  unpackNodeData,
  createNodeData,
} from './NodeData';
