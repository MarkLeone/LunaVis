/**
 * QuadTree: Manages the 6 root nodes representing cube faces for CDLOD terrain.
 *
 * The quadtree uses lazy subdivision - nodes are created on demand during LOD
 * selection and collapsed when no longer needed. This keeps memory usage
 * proportional to the visible detail level.
 *
 * Provides traversal, statistics, and node collection functionality for
 * the terrain rendering pipeline.
 */

import { QuadNode } from './QuadNode';
import type { FaceId } from '@/types';

/** Statistics about the current tree state */
export interface QuadTreeStats {
  /** Total number of nodes in the tree */
  totalNodes: number;
  /** Number of leaf nodes (renderable patches) */
  leafNodes: number;
  /** Histogram of nodes per LOD level */
  nodesPerLevel: number[];
  /** Maximum LOD level currently in use */
  maxLodLevel: number;
}

/** Callback for tree traversal */
export type TraversalCallback = (node: QuadNode) => void;

/** Predicate for conditional traversal (return true to descend into children) */
export type TraversalPredicate = (node: QuadNode) => boolean;

/**
 * Manages the quadtree structure for a spherified cube terrain.
 * Contains 6 root nodes, one for each cube face.
 */
export class QuadTree {
  /** The 6 root nodes (one per cube face) */
  private readonly _roots: readonly [
    QuadNode,
    QuadNode,
    QuadNode,
    QuadNode,
    QuadNode,
    QuadNode,
  ];

  constructor() {
    // Create root nodes for each cube face
    this._roots = [
      new QuadNode({ faceId: 0, lodLevel: 0, u: 0, v: 0, size: 1, parent: null }),
      new QuadNode({ faceId: 1, lodLevel: 0, u: 0, v: 0, size: 1, parent: null }),
      new QuadNode({ faceId: 2, lodLevel: 0, u: 0, v: 0, size: 1, parent: null }),
      new QuadNode({ faceId: 3, lodLevel: 0, u: 0, v: 0, size: 1, parent: null }),
      new QuadNode({ faceId: 4, lodLevel: 0, u: 0, v: 0, size: 1, parent: null }),
      new QuadNode({ faceId: 5, lodLevel: 0, u: 0, v: 0, size: 1, parent: null }),
    ];
  }

  // --- Accessors ---

  /** Get root node for a specific face */
  getRoot(faceId: FaceId): QuadNode {
    return this._roots[faceId];
  }

  /** Get all root nodes */
  get roots(): readonly QuadNode[] {
    return this._roots;
  }

  // --- Traversal ---

  /**
   * Traverse all nodes in the tree (depth-first, pre-order).
   * Visits parent before children.
   *
   * @param callback - Called for each node in the tree
   */
  traverse(callback: TraversalCallback): void {
    for (const root of this._roots) {
      this.traverseNode(root, callback);
    }
  }

  /**
   * Traverse nodes, descending into children only if predicate returns true.
   * Useful for frustum-culled traversal where rejected branches are skipped.
   *
   * The callback is called for every visited node (including those whose
   * children are not visited). The predicate controls whether to descend.
   *
   * @param shouldDescend - Return true to visit this node's children
   * @param callback - Called for each visited node
   */
  traverseConditional(
    shouldDescend: TraversalPredicate,
    callback: TraversalCallback
  ): void {
    for (const root of this._roots) {
      this.traverseNodeConditional(root, shouldDescend, callback);
    }
  }

  /**
   * Collect all leaf nodes (nodes without children).
   * These are the nodes that would be rendered.
   *
   * @returns Array of all leaf nodes
   */
  collectLeaves(): QuadNode[] {
    const leaves: QuadNode[] = [];
    this.traverse((node) => {
      if (node.isLeaf) {
        leaves.push(node);
      }
    });
    return leaves;
  }

  /**
   * Collect leaf nodes that pass a filter predicate.
   * Useful for collecting only visible/selected nodes.
   *
   * @param predicate - Filter function, return true to include node
   * @returns Array of matching leaf nodes
   */
  collectLeavesWhere(predicate: TraversalPredicate): QuadNode[] {
    const leaves: QuadNode[] = [];
    this.traverse((node) => {
      if (node.isLeaf && predicate(node)) {
        leaves.push(node);
      }
    });
    return leaves;
  }

  // --- Statistics ---

  /**
   * Compute statistics about the current tree state.
   * Useful for debugging and performance monitoring.
   *
   * @returns Tree statistics
   */
  getStats(): QuadTreeStats {
    let totalNodes = 0;
    let leafNodes = 0;
    let maxLodLevel = 0;
    const nodesPerLevel: number[] = [];

    this.traverse((node) => {
      totalNodes++;
      if (node.isLeaf) {
        leafNodes++;
      }
      maxLodLevel = Math.max(maxLodLevel, node.lodLevel);

      // Initialize array if needed
      while (nodesPerLevel.length <= node.lodLevel) {
        nodesPerLevel.push(0);
      }
      nodesPerLevel[node.lodLevel]!++;
    });

    return {
      totalNodes,
      leafNodes,
      nodesPerLevel,
      maxLodLevel,
    };
  }

  // --- Modification ---

  /**
   * Reset tree to initial state (6 root nodes only).
   * Collapses all subdivisions.
   */
  reset(): void {
    for (const root of this._roots) {
      root.collapse();
    }
  }

  // --- Private Methods ---

  /**
   * Recursively traverse a node and its children (depth-first, pre-order).
   */
  private traverseNode(node: QuadNode, callback: TraversalCallback): void {
    callback(node);
    if (node.children) {
      for (const child of node.children) {
        this.traverseNode(child, callback);
      }
    }
  }

  /**
   * Recursively traverse with conditional descent.
   */
  private traverseNodeConditional(
    node: QuadNode,
    shouldDescend: TraversalPredicate,
    callback: TraversalCallback
  ): void {
    callback(node);

    if (node.children && shouldDescend(node)) {
      for (const child of node.children) {
        this.traverseNodeConditional(child, shouldDescend, callback);
      }
    }
  }
}
