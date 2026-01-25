/**
 * Frustum: View frustum for culling terrain nodes.
 *
 * Extracts 6 planes from view-projection matrix using the Gribb/Hartmann method.
 * All calculations use double precision for accuracy with planetary-scale terrain.
 *
 * Plane equation: dot(normal, point) + distance = 0
 * Normals point inward (toward frustum interior).
 */

/** A single frustum plane in Hessian normal form */
export interface FrustumPlane {
  /** Unit normal pointing into the frustum */
  readonly normal: Float64Array; // [nx, ny, nz]
  /** Signed distance from origin (negative = origin is inside) */
  readonly distance: number;
}

/** Frustum plane indices */
export const enum FrustumPlaneIndex {
  Left = 0,
  Right = 1,
  Bottom = 2,
  Top = 3,
  Near = 4,
  Far = 5,
}

/**
 * View frustum for culling.
 *
 * Use `Frustum.fromViewProjection()` to create from a camera's VP matrix.
 */
export class Frustum {
  /** The 6 frustum planes [left, right, bottom, top, near, far] */
  private readonly _planes: readonly [
    FrustumPlane,
    FrustumPlane,
    FrustumPlane,
    FrustumPlane,
    FrustumPlane,
    FrustumPlane,
  ];

  private constructor(planes: [
    FrustumPlane,
    FrustumPlane,
    FrustumPlane,
    FrustumPlane,
    FrustumPlane,
    FrustumPlane,
  ]) {
    this._planes = planes;
  }

  /** Get a specific frustum plane */
  getPlane(index: FrustumPlaneIndex): FrustumPlane {
    return this._planes[index];
  }

  /** Get all 6 planes */
  get planes(): readonly FrustumPlane[] {
    return this._planes;
  }

  /**
   * Extract frustum planes from a view-projection matrix.
   *
   * Uses the Gribb/Hartmann method: planes are derived from matrix row combinations.
   * See: "Fast Extraction of Viewing Frustum Planes from the World-View-Projection Matrix"
   *
   * @param vp - 4x4 view-projection matrix (column-major, 16 elements)
   * @returns Frustum with normalized planes
   */
  static fromViewProjection(vp: Float64Array | Float32Array): Frustum {
    // wgpu-matrix uses column-major layout:
    // [ m0  m4  m8   m12 ]
    // [ m1  m5  m9   m13 ]
    // [ m2  m6  m10  m14 ]
    // [ m3  m7  m11  m15 ]
    //
    // Row 0: [m0, m4, m8, m12]
    // Row 1: [m1, m5, m9, m13]
    // Row 2: [m2, m6, m10, m14]
    // Row 3: [m3, m7, m11, m15]

    const m0 = vp[0]!;
    const m1 = vp[1]!;
    const m2 = vp[2]!;
    const m3 = vp[3]!;
    const m4 = vp[4]!;
    const m5 = vp[5]!;
    const m6 = vp[6]!;
    const m7 = vp[7]!;
    const m8 = vp[8]!;
    const m9 = vp[9]!;
    const m10 = vp[10]!;
    const m11 = vp[11]!;
    const m12 = vp[12]!;
    const m13 = vp[13]!;
    const m14 = vp[14]!;
    const m15 = vp[15]!;

    // Gribb/Hartmann extraction (row3 ± rowN)
    // Left:   row3 + row0
    // Right:  row3 - row0
    // Bottom: row3 + row1
    // Top:    row3 - row1
    // Near:   row2 (WebGPU clip space z in [0,1])
    // Far:    row3 - row2

    const planes: [
      FrustumPlane,
      FrustumPlane,
      FrustumPlane,
      FrustumPlane,
      FrustumPlane,
      FrustumPlane,
    ] = [
      // Left: row3 + row0
      Frustum.normalizePlane(m3 + m0, m7 + m4, m11 + m8, m15 + m12),
      // Right: row3 - row0
      Frustum.normalizePlane(m3 - m0, m7 - m4, m11 - m8, m15 - m12),
      // Bottom: row3 + row1
      Frustum.normalizePlane(m3 + m1, m7 + m5, m11 + m9, m15 + m13),
      // Top: row3 - row1
      Frustum.normalizePlane(m3 - m1, m7 - m5, m11 - m9, m15 - m13),
      // Near: row2
      Frustum.normalizePlane(m2, m6, m10, m14),
      // Far: row3 - row2
      Frustum.normalizePlane(m3 - m2, m7 - m6, m11 - m10, m15 - m14),
    ];

    return new Frustum(planes);
  }

  /**
   * Normalize a plane to unit normal form.
   */
  private static normalizePlane(
    a: number,
    b: number,
    c: number,
    d: number
  ): FrustumPlane {
    const length = Math.sqrt(a * a + b * b + c * c);

    if (length < 1e-10) {
      // Degenerate plane, return a valid but arbitrary plane
      return {
        normal: new Float64Array([0, 0, 1]),
        distance: 0,
      };
    }

    const invLen = 1 / length;
    return {
      normal: new Float64Array([a * invLen, b * invLen, c * invLen]),
      distance: d * invLen,
    };
  }

  /**
   * Test if a sphere intersects or is inside the frustum.
   *
   * @param center - Sphere center (double precision)
   * @param radius - Sphere radius
   * @returns true if sphere intersects or is inside frustum
   */
  intersectsSphere(center: Float64Array, radius: number): boolean {
    const cx = center[0]!;
    const cy = center[1]!;
    const cz = center[2]!;

    for (const plane of this._planes) {
      const nx = plane.normal[0]!;
      const ny = plane.normal[1]!;
      const nz = plane.normal[2]!;

      // Signed distance from sphere center to plane
      const signedDist = nx * cx + ny * cy + nz * cz + plane.distance;

      // If center is more than radius outside the plane, sphere is culled
      if (signedDist < -radius) {
        return false;
      }
    }

    return true;
  }

  /**
   * Test if a sphere is completely inside the frustum.
   *
   * @param center - Sphere center (double precision)
   * @param radius - Sphere radius
   * @returns true if sphere is entirely within frustum
   */
  containsSphere(center: Float64Array, radius: number): boolean {
    const cx = center[0]!;
    const cy = center[1]!;
    const cz = center[2]!;

    for (const plane of this._planes) {
      const nx = plane.normal[0]!;
      const ny = plane.normal[1]!;
      const nz = plane.normal[2]!;

      // Signed distance from sphere center to plane
      const signedDist = nx * cx + ny * cy + nz * cz + plane.distance;

      // Sphere must be entirely on the inside (positive side) of each plane
      if (signedDist < radius) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get the signed distance from a point to a frustum plane.
   * Positive = inside frustum, negative = outside.
   *
   * @param point - Point to test (double precision)
   * @param planeIndex - Which plane to test against
   * @returns Signed distance
   */
  signedDistanceToPlane(
    point: Float64Array,
    planeIndex: FrustumPlaneIndex
  ): number {
    const plane = this._planes[planeIndex];
    const nx = plane.normal[0]!;
    const ny = plane.normal[1]!;
    const nz = plane.normal[2]!;

    return nx * point[0]! + ny * point[1]! + nz * point[2]! + plane.distance;
  }
}
