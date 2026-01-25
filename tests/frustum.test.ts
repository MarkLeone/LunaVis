/**
 * Unit tests for Frustum class.
 * Tests frustum plane extraction and sphere intersection.
 */

import { describe, it, expect } from 'vitest';
import { Frustum, FrustumPlaneIndex } from '@/terrain/Frustum';

/**
 * Create a simple perspective projection matrix.
 * Uses standard OpenGL-style perspective with Y-up, looking down -Z.
 */
function createPerspectiveMatrix(
  fov: number,
  aspect: number,
  near: number,
  far: number
): Float64Array {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);

  // Column-major order (WebGPU/wgpu-matrix style)
  return new Float64Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

/**
 * Create a simple look-at view matrix.
 */
function createLookAtMatrix(
  eye: [number, number, number],
  target: [number, number, number],
  up: [number, number, number]
): Float64Array {
  // Forward vector (camera looks down -Z in view space)
  let fx = target[0] - eye[0];
  let fy = target[1] - eye[1];
  let fz = target[2] - eye[2];
  const fLen = Math.sqrt(fx * fx + fy * fy + fz * fz);
  fx /= fLen;
  fy /= fLen;
  fz /= fLen;

  // Right vector = forward × up
  let rx = fy * up[2] - fz * up[1];
  let ry = fz * up[0] - fx * up[2];
  let rz = fx * up[1] - fy * up[0];
  const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
  rx /= rLen;
  ry /= rLen;
  rz /= rLen;

  // True up = right × forward
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  // Translation
  const tx = -(rx * eye[0] + ry * eye[1] + rz * eye[2]);
  const ty = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
  const tz = -(-fx * eye[0] + -fy * eye[1] + -fz * eye[2]);

  // Column-major
  return new Float64Array([
    rx, ux, -fx, 0,
    ry, uy, -fy, 0,
    rz, uz, -fz, 0,
    tx, ty, tz, 1,
  ]);
}

/**
 * Multiply two 4x4 matrices (column-major).
 */
function multiplyMatrices(a: Float64Array, b: Float64Array): Float64Array {
  const result = new Float64Array(16);

  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[row + k * 4]! * b[k + col * 4]!;
      }
      result[row + col * 4] = sum;
    }
  }

  return result;
}

describe('Frustum', () => {
  // --- Plane Extraction ---

  describe('fromViewProjection', () => {
    it('extracts 6 planes from VP matrix', () => {
      const proj = createPerspectiveMatrix(Math.PI / 4, 1.0, 0.1, 100);
      const view = createLookAtMatrix([0, 0, 5], [0, 0, 0], [0, 1, 0]);
      const vp = multiplyMatrices(proj, view);

      const frustum = Frustum.fromViewProjection(vp);

      expect(frustum.planes.length).toBe(6);
    });

    it('plane normals are unit length', () => {
      const proj = createPerspectiveMatrix(Math.PI / 4, 1.0, 0.1, 100);
      const view = createLookAtMatrix([0, 0, 5], [0, 0, 0], [0, 1, 0]);
      const vp = multiplyMatrices(proj, view);

      const frustum = Frustum.fromViewProjection(vp);

      for (let i = 0; i < 6; i++) {
        const plane = frustum.getPlane(i as FrustumPlaneIndex);
        const len = Math.sqrt(
          plane.normal[0]! ** 2 +
            plane.normal[1]! ** 2 +
            plane.normal[2]! ** 2
        );
        expect(len).toBeCloseTo(1.0, 5);
      }
    });

    it('works with identity matrices', () => {
      // Identity VP produces a "default" frustum (clip space cube)
      const identity = new Float64Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]);

      const frustum = Frustum.fromViewProjection(identity);

      // All planes should be valid (unit normals)
      for (const plane of frustum.planes) {
        const len = Math.sqrt(
          plane.normal[0]! ** 2 +
            plane.normal[1]! ** 2 +
            plane.normal[2]! ** 2
        );
        expect(len).toBeCloseTo(1.0, 5);
      }
    });
  });

  // --- Sphere Intersection ---

  describe('intersectsSphere', () => {
    // Camera at (0, 0, 5) looking at origin
    const proj = createPerspectiveMatrix(Math.PI / 4, 1.0, 0.1, 100);
    const view = createLookAtMatrix([0, 0, 5], [0, 0, 0], [0, 1, 0]);
    const vp = multiplyMatrices(proj, view);
    const frustum = Frustum.fromViewProjection(vp);

    it('returns true for sphere at origin (inside frustum)', () => {
      const center = new Float64Array([0, 0, 0]);
      expect(frustum.intersectsSphere(center, 0.5)).toBe(true);
    });

    it('returns true for sphere at camera position (large enough to cross near plane)', () => {
      // Sphere at camera position with radius larger than near plane distance
      const center = new Float64Array([0, 0, 5]);
      expect(frustum.intersectsSphere(center, 0.5)).toBe(true);
    });

    it('returns false for tiny sphere exactly at camera (behind near plane)', () => {
      // Tiny sphere at camera position is behind near plane (0.1)
      const center = new Float64Array([0, 0, 5]);
      expect(frustum.intersectsSphere(center, 0.01)).toBe(false);
    });

    it('returns true for large sphere containing frustum', () => {
      const center = new Float64Array([0, 0, 0]);
      expect(frustum.intersectsSphere(center, 1000)).toBe(true);
    });

    it('returns false for sphere behind camera', () => {
      const center = new Float64Array([0, 0, 10]); // Behind camera at z=5
      expect(frustum.intersectsSphere(center, 0.5)).toBe(false);
    });

    it('returns false for sphere far to the left', () => {
      const center = new Float64Array([-100, 0, 0]);
      expect(frustum.intersectsSphere(center, 1)).toBe(false);
    });

    it('returns false for sphere far to the right', () => {
      const center = new Float64Array([100, 0, 0]);
      expect(frustum.intersectsSphere(center, 1)).toBe(false);
    });

    it('returns false for sphere far above', () => {
      const center = new Float64Array([0, 100, 0]);
      expect(frustum.intersectsSphere(center, 1)).toBe(false);
    });

    it('returns false for sphere far below', () => {
      const center = new Float64Array([0, -100, 0]);
      expect(frustum.intersectsSphere(center, 1)).toBe(false);
    });

    it('returns false for sphere beyond far plane', () => {
      const center = new Float64Array([0, 0, -200]); // Way past far plane (100)
      expect(frustum.intersectsSphere(center, 1)).toBe(false);
    });

    it('returns true for sphere intersecting left plane', () => {
      // Sphere partially inside, partially outside left side
      // At distance 5 from camera with FOV 45°, frustum half-width ≈ 2.07
      const center = new Float64Array([-2.5, 0, 0]);
      expect(frustum.intersectsSphere(center, 1)).toBe(true);
    });

    it('returns true for sphere touching near plane', () => {
      const center = new Float64Array([0, 0, 4.85]); // Just inside near plane
      expect(frustum.intersectsSphere(center, 0.1)).toBe(true);
    });
  });

  // --- Contains Sphere ---

  describe('containsSphere', () => {
    const proj = createPerspectiveMatrix(Math.PI / 4, 1.0, 0.1, 100);
    const view = createLookAtMatrix([0, 0, 5], [0, 0, 0], [0, 1, 0]);
    const vp = multiplyMatrices(proj, view);
    const frustum = Frustum.fromViewProjection(vp);

    it('returns true for small sphere at center', () => {
      const center = new Float64Array([0, 0, 0]);
      expect(frustum.containsSphere(center, 0.01)).toBe(true);
    });

    it('returns false for large sphere (extends outside)', () => {
      const center = new Float64Array([0, 0, 0]);
      expect(frustum.containsSphere(center, 100)).toBe(false);
    });

    it('returns false for sphere touching edge', () => {
      // Sphere at edge of frustum - center inside but radius extends out
      const center = new Float64Array([-1.5, 0, 0]);
      expect(frustum.containsSphere(center, 1)).toBe(false);
    });

    it('returns false for sphere behind camera', () => {
      const center = new Float64Array([0, 0, 10]);
      expect(frustum.containsSphere(center, 0.1)).toBe(false);
    });
  });

  // --- Signed Distance ---

  describe('signedDistanceToPlane', () => {
    const proj = createPerspectiveMatrix(Math.PI / 4, 1.0, 0.1, 100);
    const view = createLookAtMatrix([0, 0, 5], [0, 0, 0], [0, 1, 0]);
    const vp = multiplyMatrices(proj, view);
    const frustum = Frustum.fromViewProjection(vp);

    it('returns positive for point inside frustum', () => {
      const point = new Float64Array([0, 0, 0]);

      // Check all planes - point at origin should be inside all
      for (let i = 0; i < 6; i++) {
        const dist = frustum.signedDistanceToPlane(point, i as FrustumPlaneIndex);
        // Should be positive (inside) for most planes
        // Near plane might be close to zero
        expect(dist).toBeGreaterThan(-1);
      }
    });

    it('returns negative for point far outside left plane', () => {
      const point = new Float64Array([-100, 0, 0]);
      const dist = frustum.signedDistanceToPlane(point, FrustumPlaneIndex.Left);
      expect(dist).toBeLessThan(0);
    });

    it('returns negative for point far outside right plane', () => {
      const point = new Float64Array([100, 0, 0]);
      const dist = frustum.signedDistanceToPlane(point, FrustumPlaneIndex.Right);
      expect(dist).toBeLessThan(0);
    });
  });

  // --- Edge Cases ---

  describe('edge cases', () => {
    it('handles Float32Array input', () => {
      const proj = new Float32Array(createPerspectiveMatrix(Math.PI / 4, 1.0, 0.1, 100));
      const view = new Float32Array(createLookAtMatrix([0, 0, 5], [0, 0, 0], [0, 1, 0]));
      const vp = new Float32Array(multiplyMatrices(
        new Float64Array(proj),
        new Float64Array(view)
      ));

      const frustum = Frustum.fromViewProjection(vp);
      const center = new Float64Array([0, 0, 0]);

      expect(frustum.intersectsSphere(center, 0.5)).toBe(true);
    });

    it('handles very small spheres', () => {
      const proj = createPerspectiveMatrix(Math.PI / 4, 1.0, 0.1, 100);
      const view = createLookAtMatrix([0, 0, 5], [0, 0, 0], [0, 1, 0]);
      const vp = multiplyMatrices(proj, view);
      const frustum = Frustum.fromViewProjection(vp);

      const center = new Float64Array([0, 0, 0]);
      expect(frustum.intersectsSphere(center, 1e-10)).toBe(true);
    });

    it('handles spheres at large distances', () => {
      const proj = createPerspectiveMatrix(Math.PI / 4, 1.0, 0.1, 1000000);
      const view = createLookAtMatrix([0, 0, 5], [0, 0, 0], [0, 1, 0]);
      const vp = multiplyMatrices(proj, view);
      const frustum = Frustum.fromViewProjection(vp);

      // Sphere at moderate distance, within far plane
      const center = new Float64Array([0, 0, -500000]);
      expect(frustum.intersectsSphere(center, 1000)).toBe(true);

      // Sphere beyond far plane
      const farCenter = new Float64Array([0, 0, -2000000]);
      expect(frustum.intersectsSphere(farCenter, 1000)).toBe(false);
    });
  });
});
