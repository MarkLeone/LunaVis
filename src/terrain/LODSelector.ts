/**
 * LODSelector: CPU-side LOD selection for CDLOD terrain.
 *
 * Traverses the quadtree, applies frustum culling and distance-based LOD selection,
 * and outputs an array of NodeData for GPU rendering.
 *
 * Uses screen-space error metric to derive LOD thresholds, ensuring consistent
 * visual quality across different resolutions and FOV settings.
 *
 * Distance calculations use double precision for stable LOD decisions.
 */

import { QuadTree } from './QuadTree';
import { QuadNode } from './QuadNode';
import { Frustum } from './Frustum';
import type { NodeData } from './NodeData';
import type { FaceId } from '@/types';

/**
 * Configuration for LOD selection.
 */
export interface LODConfig {
  /**
   * Maximum pixels of geometric error allowed on screen.
   * Lower values = higher quality, more triangles.
   * Typical range: 2-8 pixels. Default: 4.0
   */
  maxPixelError: number;

  /**
   * Screen height in pixels.
   * Used for screen-space error calculation.
   */
  screenHeight: number;

  /**
   * Vertical field of view in radians.
   * Used for screen-space error calculation.
   */
  fov: number;

  /**
   * Maximum LOD depth to allow.
   * Higher values = more detail levels available.
   * Default: 12
   */
  maxLodLevel: number;

  /**
   * Morph zone ratio (0-1).
   * morphStart = morphEnd * morphRatio.
   * 0.7 means morphing starts at 70% of the LOD range.
   * Default: 0.8
   */
  morphRatio: number;
}

/**
 * Pre-computed distance thresholds for a single LOD level.
 */
export interface LODRange {
  /** Distance at which this LOD level should be used (morphEnd) */
  distance: number;
  /** Distance where morphing begins */
  morphStart: number;
}

/** Default LOD configuration */
const DEFAULT_CONFIG: LODConfig = {
  maxPixelError: 4.0,
  screenHeight: 1080,
  fov: Math.PI / 4, // 45 degrees
  maxLodLevel: 12,
  morphRatio: 0.8,
};

/**
 * Statistics about the last selection pass.
 */
export interface LODSelectionStats {
  /** Total nodes visited during traversal */
  nodesVisited: number;
  /** Nodes culled by frustum */
  nodesCulled: number;
  /** Nodes selected for rendering */
  nodesSelected: number;
  /** Histogram of selected nodes per LOD level */
  nodesPerLevel: number[];
  /** Maximum LOD level in selection */
  maxLodLevel: number;
}

/**
 * LOD selector for CDLOD terrain rendering.
 *
 * @example
 * ```ts
 * const selector = new LODSelector({ maxPixelError: 4.0 });
 * selector.updateRanges(canvas.height, camera.fov);
 *
 * const cameraPos = new Float64Array([0, 0, 5]);
 * const frustum = Frustum.fromViewProjection(camera.viewProjectionMatrix);
 * const nodes = selector.selectNodes(tree, cameraPos, frustum);
 * ```
 */
export class LODSelector {
  private _config: LODConfig;
  private _ranges: LODRange[];
  private _stats: LODSelectionStats;

  constructor(config: Partial<LODConfig> = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._ranges = [];
    this._stats = this.createEmptyStats();

    // Initialize ranges with current config
    this.updateRanges(this._config.screenHeight, this._config.fov);
  }

  // --- Accessors ---

  /** Current configuration */
  get config(): Readonly<LODConfig> {
    return this._config;
  }

  /** Pre-computed LOD ranges */
  get ranges(): readonly LODRange[] {
    return this._ranges;
  }

  /** Statistics from last selection */
  get stats(): Readonly<LODSelectionStats> {
    return this._stats;
  }

  // --- Configuration ---

  /**
   * Update LOD configuration.
   * Call updateRanges() after changing config that affects thresholds.
   */
  setConfig(config: Partial<LODConfig>): void {
    this._config = { ...this._config, ...config };
  }

  /**
   * Recalculate LOD ranges based on screen dimensions and FOV.
   *
   * Call this when:
   * - Window is resized
   * - Camera FOV changes
   * - maxPixelError is adjusted
   *
   * @param screenHeight - Screen height in pixels
   * @param fov - Vertical FOV in radians
   */
  updateRanges(screenHeight: number, fov: number): void {
    this._config.screenHeight = screenHeight;
    this._config.fov = fov;

    const { maxPixelError, maxLodLevel, morphRatio } = this._config;

    // Screen-space error formula (solved for distance):
    // pixelError = (nodeSize * screenHeight) / (distance * 2 * tan(fov/2))
    // distance = (nodeSize * screenHeight) / (pixelError * 2 * tan(fov/2))
    //
    // fitParam = screenHeight / (2 * tan(fov/2))
    // distance = (nodeSize * fitParam) / pixelError

    const fitParam = screenHeight / (2 * Math.tan(fov / 2));

    // Calculate range for the finest LOD level
    // At maxLodLevel, nodeSize = 1 / 2^maxLodLevel
    const finestNodeSize = 1 / Math.pow(2, maxLodLevel);
    const finestRange = (finestNodeSize * fitParam) / maxPixelError;

    // Build ranges array
    // LOD 0 = coarsest (largest range), LOD maxLodLevel = finest (smallest range)
    this._ranges = [];

    for (let lod = 0; lod <= maxLodLevel; lod++) {
      // Distance doubles for each coarser level
      const levelsFromFinest = maxLodLevel - lod;
      const distance = finestRange * Math.pow(2, levelsFromFinest);

      this._ranges[lod] = {
        distance,
        morphStart: distance * morphRatio,
      };
    }
  }

  /**
   * Select visible nodes for rendering.
   *
   * Traverses the quadtree, applying frustum culling and LOD selection.
   * Returns an array of NodeData ready for GPU upload.
   *
   * @param tree - Quadtree to traverse
   * @param cameraPos - Camera position in world space (double precision)
   * @param frustum - View frustum for culling (null = disable culling)
   * @returns Array of NodeData for visible nodes
   */
  selectNodes(
    tree: QuadTree,
    cameraPos: Float64Array,
    frustum: Frustum | null
  ): NodeData[] {
    // Reset stats
    this._stats = this.createEmptyStats();

    const results: NodeData[] = [];

    // Traverse each cube face
    for (const root of tree.roots) {
      this.selectNodeRecursive(root, cameraPos, frustum, results);
    }

    // Update final stats
    this._stats.nodesSelected = results.length;
    if (results.length > 0) {
      this._stats.maxLodLevel = Math.max(...results.map((n) => n.lodLevel));
    }

    return results;
  }

  /**
   * Recursive node selection.
   */
  private selectNodeRecursive(
    node: QuadNode,
    cameraPos: Float64Array,
    frustum: Frustum | null,
    results: NodeData[]
  ): void {
    this._stats.nodesVisited++;

    // 1. Frustum culling (early out)
    if (frustum) {
      const sphere = node.boundingSphere;
      if (!frustum.intersectsSphere(sphere.center, sphere.radius)) {
        this._stats.nodesCulled++;
        return; // Entire subtree culled
      }
    }

    // 2. Calculate distance from camera to node center (double precision)
    const dist = this.distanceToNode(node, cameraPos);

    // 3. LOD decision
    const range = this._ranges[node.lodLevel];
    if (!range) {
      // Beyond max LOD, render this node
      this.addNodeToResults(node, dist, results);
      return;
    }

    const shouldSubdivide =
      dist < range.distance && node.lodLevel < this._config.maxLodLevel;

    if (shouldSubdivide) {
      // Need more detail - ensure node is subdivided
      if (node.isLeaf) {
        node.subdivide();
      }

      // Recurse into children
      for (const child of node.children!) {
        this.selectNodeRecursive(child, cameraPos, frustum, results);
      }
    } else {
      // This node is detailed enough - render it
      // Collapse any existing children (detail no longer needed)
      if (node.isSubdivided) {
        node.collapse();
      }

      this.addNodeToResults(node, dist, results);
    }
  }

  /**
   * Add a node to the results array.
   */
  private addNodeToResults(
    node: QuadNode,
    distance: number,
    results: NodeData[]
  ): void {
    const origin = node.origin;

    // Get morph range for this LOD level
    const range = this._ranges[node.lodLevel];
    const morphStart = range?.morphStart ?? distance * 0.8;
    const morphEnd = range?.distance ?? distance;

    const nodeData: NodeData = {
      relativeOrigin: [origin[0]!, origin[1]!, 0],
      scale: node.size,
      lodLevel: node.lodLevel,
      faceId: node.faceId as FaceId,
      morphStart,
      morphEnd,
    };

    results.push(nodeData);

    // Update per-level stats
    while (this._stats.nodesPerLevel.length <= node.lodLevel) {
      this._stats.nodesPerLevel.push(0);
    }
    this._stats.nodesPerLevel[node.lodLevel]!++;
  }

  /**
   * Calculate distance from camera to node center.
   * Uses double precision throughout.
   */
  private distanceToNode(node: QuadNode, cameraPos: Float64Array): number {
    const center = node.sphereCenter;
    const dx = center[0]! - cameraPos[0]!;
    const dy = center[1]! - cameraPos[1]!;
    const dz = center[2]! - cameraPos[2]!;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Create empty stats object.
   */
  private createEmptyStats(): LODSelectionStats {
    return {
      nodesVisited: 0,
      nodesCulled: 0,
      nodesSelected: 0,
      nodesPerLevel: [],
      maxLodLevel: 0,
    };
  }

  // --- Debug Utilities ---

  /**
   * Get the LOD range for a specific level.
   * Useful for debugging and visualization.
   */
  getRangeForLevel(level: number): LODRange | undefined {
    return this._ranges[level];
  }

  /**
   * Calculate which LOD level would be used at a given distance.
   * Useful for debugging.
   */
  getLevelForDistance(distance: number): number {
    for (let lod = this._config.maxLodLevel; lod >= 0; lod--) {
      const range = this._ranges[lod];
      if (range && distance < range.distance) {
        return lod;
      }
    }
    return 0;
  }

  /**
   * Format ranges as a debug string.
   */
  formatRanges(): string {
    const lines = ['LOD Ranges:'];
    for (let lod = 0; lod < this._ranges.length; lod++) {
      const range = this._ranges[lod]!;
      lines.push(
        `  LOD ${lod}: distance=${range.distance.toFixed(4)}, morphStart=${range.morphStart.toFixed(4)}`
      );
    }
    return lines.join('\n');
  }
}
