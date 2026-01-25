/**
 * QuadNode: A single node in the quadtree representing a patch on one cube face.
 *
 * Each node covers a square region on a cube face, defined by UV coordinates (0-1 range).
 * The node's region extends from (u, v) to (u + size, v + size).
 *
 * Uses Float64Array internally for double-precision bounds calculation to maintain
 * accuracy at high LOD levels (12+) where patches become extremely small.
 *
 * Coordinate System (right-handed Y-up):
 * - Face 0 (+Z): front, toward viewer
 * - Face 1 (-Z): back
 * - Face 2 (+X): right
 * - Face 3 (-X): left
 * - Face 4 (+Y): top
 * - Face 5 (-Y): bottom
 */

import type { QuadNodeId, FaceId } from '@/types';
import { quadNodeId } from '@/types';

/** Bounding sphere for frustum culling */
export interface BoundingSphere {
  /** Center point (double precision) */
  readonly center: Float64Array; // [x, y, z]
  /** Radius of bounding sphere */
  readonly radius: number;
}

/** Child quadrant indices */
export const enum Quadrant {
  /** Bottom-left (u, v) */
  SW = 0,
  /** Bottom-right (u + half, v) */
  SE = 1,
  /** Top-left (u, v + half) */
  NW = 2,
  /** Top-right (u + half, v + half) */
  NE = 3,
}

/** Options for creating a QuadNode */
export interface QuadNodeOptions {
  /** Face ID (0-5) */
  faceId: FaceId;
  /** LOD level (0 = root, higher = more detail) */
  lodLevel: number;
  /** U coordinate on face (0-1) */
  u: number;
  /** V coordinate on face (0-1) */
  v: number;
  /** Size of node in UV space (0-1, root = 1.0) */
  size: number;
  /** Parent node (null for root) */
  parent: QuadNode | null;
}

/**
 * A node in the quadtree representing a terrain patch on a spherified cube face.
 */
export class QuadNode {
  /** Unique identifier for this node */
  readonly id: QuadNodeId;
  /** Cube face this node belongs to (0-5) */
  readonly faceId: FaceId;
  /** LOD level (0 = root, higher = more detail) */
  readonly lodLevel: number;

  /** UV origin (bottom-left corner) on cube face - double precision */
  private readonly _origin: Float64Array; // [u, v]
  /** Size in UV space - double precision */
  private readonly _size: number;

  /** Parent node (null for root nodes) */
  readonly parent: QuadNode | null;
  /** Child nodes (null until subdivided) */
  private _children: [QuadNode, QuadNode, QuadNode, QuadNode] | null = null;

  /** Cached bounding sphere (for spherified cube) */
  private _boundingSphere: BoundingSphere | null = null;
  /** Cached bounding sphere for flat cube (M11) */
  private _cubeBoundingSphere: BoundingSphere | null = null;
  /** Cached center point on unit sphere */
  private _sphereCenter: Float64Array | null = null;

  /** Maximum LOD depth supported */
  static readonly MAX_LOD_LEVEL = 15;

  constructor(options: QuadNodeOptions) {
    this.id = quadNodeId(
      `node-f${options.faceId}-L${options.lodLevel}-${options.u.toFixed(6)}-${options.v.toFixed(6)}`
    );
    this.faceId = options.faceId;
    this.lodLevel = options.lodLevel;
    this._origin = new Float64Array([options.u, options.v]);
    this._size = options.size;
    this.parent = options.parent;
  }

  // --- Getters ---

  /** UV origin as readonly tuple [u, v] */
  get origin(): readonly [number, number] {
    return [this._origin[0]!, this._origin[1]!];
  }

  /** Size in UV space */
  get size(): number {
    return this._size;
  }

  /** UV center point as readonly tuple [u, v] */
  get uvCenter(): readonly [number, number] {
    const half = this._size / 2;
    return [this._origin[0]! + half, this._origin[1]! + half];
  }

  /** Center point on unit sphere (double precision, cached) */
  get sphereCenter(): Float64Array {
    if (!this._sphereCenter) {
      this._sphereCenter = this.computeSphereCenter();
    }
    return this._sphereCenter;
  }

  /** Bounding sphere for frustum culling - spherified cube (cached) */
  get boundingSphere(): BoundingSphere {
    if (!this._boundingSphere) {
      this._boundingSphere = this.computeBoundingSphere();
    }
    return this._boundingSphere;
  }

  /** Bounding sphere for frustum culling - flat cube M11 (cached) */
  get cubeBoundingSphere(): BoundingSphere {
    if (!this._cubeBoundingSphere) {
      this._cubeBoundingSphere = this.computeCubeBoundingSphere();
    }
    return this._cubeBoundingSphere;
  }

  /** Whether this node has children */
  get isSubdivided(): boolean {
    return this._children !== null;
  }

  /** Whether this is a leaf node (no children) */
  get isLeaf(): boolean {
    return this._children === null;
  }

  /** Child nodes (null if not subdivided) */
  get children(): readonly [QuadNode, QuadNode, QuadNode, QuadNode] | null {
    return this._children;
  }

  // --- Subdivision ---

  /**
   * Subdivide this node into 4 children.
   *
   * Child layout:
   * ```
   * +-------+-------+
   * |  NW   |  NE   |  v + size
   * | (2)   | (3)   |
   * +-------+-------+
   * |  SW   |  SE   |  v
   * | (0)   | (1)   |
   * +-------+-------+
   * u      u+s/2   u+s
   * ```
   *
   * @returns The 4 child nodes [SW, SE, NW, NE]
   * @throws Error if already subdivided or at max depth
   */
  subdivide(): [QuadNode, QuadNode, QuadNode, QuadNode] {
    if (this._children) {
      throw new Error(`Node ${this.id} is already subdivided`);
    }
    if (this.lodLevel >= QuadNode.MAX_LOD_LEVEL) {
      throw new Error(`Cannot subdivide beyond LOD level ${QuadNode.MAX_LOD_LEVEL}`);
    }

    const half = this._size / 2;
    const u = this._origin[0]!;
    const v = this._origin[1]!;
    const childLod = this.lodLevel + 1;

    this._children = [
      // SW (bottom-left)
      new QuadNode({
        faceId: this.faceId,
        lodLevel: childLod,
        u: u,
        v: v,
        size: half,
        parent: this,
      }),
      // SE (bottom-right)
      new QuadNode({
        faceId: this.faceId,
        lodLevel: childLod,
        u: u + half,
        v: v,
        size: half,
        parent: this,
      }),
      // NW (top-left)
      new QuadNode({
        faceId: this.faceId,
        lodLevel: childLod,
        u: u,
        v: v + half,
        size: half,
        parent: this,
      }),
      // NE (top-right)
      new QuadNode({
        faceId: this.faceId,
        lodLevel: childLod,
        u: u + half,
        v: v + half,
        size: half,
        parent: this,
      }),
    ];

    return this._children;
  }

  /**
   * Collapse children back into this node (un-subdivide).
   * Recursively collapses all descendants first.
   * Used when camera moves away and detail is no longer needed.
   */
  collapse(): void {
    if (!this._children) {
      return; // Already a leaf
    }

    // Recursively collapse children first
    for (const child of this._children) {
      child.collapse();
    }

    this._children = null;
  }

  // --- Coordinate Conversion ---

  /**
   * Convert UV coordinates on this face to a 3D direction vector on the cube.
   * The resulting vector points from cube center to the cube surface (not normalized).
   *
   * Face mapping (right-handed Y-up):
   * - Face 0 (+Z): front, toward viewer
   * - Face 1 (-Z): back
   * - Face 2 (+X): right
   * - Face 3 (-X): left
   * - Face 4 (+Y): top
   * - Face 5 (-Y): bottom
   *
   * @param u - U coordinate (0-1)
   * @param v - V coordinate (0-1)
   * @returns Direction vector [x, y, z] on unit cube surface
   */
  uvToCubeDirection(u: number, v: number): Float64Array {
    // Map 0..1 to -1..1
    const uc = 2 * u - 1;
    const vc = 2 * v - 1;
    const dir = new Float64Array(3);

    switch (this.faceId) {
      case 0: // +Z (front)
        dir[0] = uc;
        dir[1] = vc;
        dir[2] = 1;
        break;
      case 1: // -Z (back)
        dir[0] = -uc;
        dir[1] = vc;
        dir[2] = -1;
        break;
      case 2: // +X (right)
        dir[0] = 1;
        dir[1] = vc;
        dir[2] = -uc;
        break;
      case 3: // -X (left)
        dir[0] = -1;
        dir[1] = vc;
        dir[2] = uc;
        break;
      case 4: // +Y (top)
        dir[0] = uc;
        dir[1] = 1;
        dir[2] = -vc;
        break;
      case 5: // -Y (bottom)
        dir[0] = uc;
        dir[1] = -1;
        dir[2] = vc;
        break;
    }

    return dir;
  }

  /**
   * Normalize a cube direction vector to get a point on the unit sphere.
   * This is the "spherified cube" projection.
   *
   * @param cubeDir - Direction vector on cube surface
   * @returns Normalized point on unit sphere
   */
  static normalizeToSphere(cubeDir: Float64Array): Float64Array {
    const x = cubeDir[0]!;
    const y = cubeDir[1]!;
    const z = cubeDir[2]!;
    const len = Math.sqrt(x * x + y * y + z * z);

    if (len === 0) {
      return new Float64Array([0, 0, 1]); // Fallback
    }

    return new Float64Array([x / len, y / len, z / len]);
  }

  // --- Private Methods ---

  /**
   * Compute the center point of this node on the unit sphere.
   */
  private computeSphereCenter(): Float64Array {
    const [cu, cv] = this.uvCenter;
    const cubeDir = this.uvToCubeDirection(cu, cv);
    return QuadNode.normalizeToSphere(cubeDir);
  }

  /**
   * Compute bounding sphere that encompasses this node's spherified patch.
   *
   * Algorithm:
   * 1. Sample the 4 corners of the patch on the sphere
   * 2. Find the maximum distance from center to any corner
   * 3. Add 10% margin for curved surface between samples
   */
  private computeBoundingSphere(): BoundingSphere {
    const center = this.sphereCenter;
    const u = this._origin[0]!;
    const v = this._origin[1]!;
    const s = this._size;

    // Sample corners on unit sphere
    const corners = [
      QuadNode.normalizeToSphere(this.uvToCubeDirection(u, v)), // SW
      QuadNode.normalizeToSphere(this.uvToCubeDirection(u + s, v)), // SE
      QuadNode.normalizeToSphere(this.uvToCubeDirection(u, v + s)), // NW
      QuadNode.normalizeToSphere(this.uvToCubeDirection(u + s, v + s)), // NE
    ];

    // Find maximum distance from center to any corner
    let maxDistSq = 0;
    for (const corner of corners) {
      const dx = corner[0]! - center[0]!;
      const dy = corner[1]! - center[1]!;
      const dz = corner[2]! - center[2]!;
      const distSq = dx * dx + dy * dy + dz * dz;
      maxDistSq = Math.max(maxDistSq, distSq);
    }

    // Add 10% margin for curved surface bulge between corners
    const radius = Math.sqrt(maxDistSq) * 1.1;

    return { center, radius };
  }

  /**
   * Compute bounding sphere for flat cube rendering (M11).
   *
   * Unlike computeBoundingSphere(), this uses raw cube coordinates
   * WITHOUT normalizing to unit sphere. Used for frustum culling
   * when rendering flat cube faces.
   */
  private computeCubeBoundingSphere(): BoundingSphere {
    const u = this._origin[0]!;
    const v = this._origin[1]!;
    const s = this._size;

    // Get cube corners (not normalized)
    const corners = [
      this.uvToCubeDirection(u, v), // SW
      this.uvToCubeDirection(u + s, v), // SE
      this.uvToCubeDirection(u, v + s), // NW
      this.uvToCubeDirection(u + s, v + s), // NE
    ];

    // Compute center as average of corners
    let cx = 0, cy = 0, cz = 0;
    for (const corner of corners) {
      cx += corner[0]!;
      cy += corner[1]!;
      cz += corner[2]!;
    }
    cx /= 4;
    cy /= 4;
    cz /= 4;
    const center = new Float64Array([cx, cy, cz]);

    // Find maximum distance from center to any corner
    let maxDistSq = 0;
    for (const corner of corners) {
      const dx = corner[0]! - cx;
      const dy = corner[1]! - cy;
      const dz = corner[2]! - cz;
      const distSq = dx * dx + dy * dy + dz * dz;
      maxDistSq = Math.max(maxDistSq, distSq);
    }

    // Add small margin for numerical precision
    const radius = Math.sqrt(maxDistSq) * 1.01;

    return { center, radius };
  }
}
