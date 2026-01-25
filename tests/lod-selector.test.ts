/**
 * Unit tests for LODSelector class.
 * Tests LOD range calculation, node selection, and frustum culling integration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LODSelector } from '@/terrain/LODSelector';
import { QuadTree } from '@/terrain/QuadTree';
import { Frustum } from '@/terrain/Frustum';
import { packNodeData, unpackNodeData, NODE_DATA_FLOATS } from '@/terrain/NodeData';

/**
 * Create a perspective projection matrix (column-major).
 */
function createPerspectiveMatrix(
  fov: number,
  aspect: number,
  near: number,
  far: number
): Float64Array {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);

  return new Float64Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

/**
 * Create a look-at view matrix (column-major).
 */
function createLookAtMatrix(
  eye: [number, number, number],
  target: [number, number, number],
  up: [number, number, number]
): Float64Array {
  let fx = target[0] - eye[0];
  let fy = target[1] - eye[1];
  let fz = target[2] - eye[2];
  const fLen = Math.sqrt(fx * fx + fy * fy + fz * fz);
  fx /= fLen;
  fy /= fLen;
  fz /= fLen;

  let rx = fy * up[2] - fz * up[1];
  let ry = fz * up[0] - fx * up[2];
  let rz = fx * up[1] - fy * up[0];
  const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
  rx /= rLen;
  ry /= rLen;
  rz /= rLen;

  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  const tx = -(rx * eye[0] + ry * eye[1] + rz * eye[2]);
  const ty = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
  const tz = -(-fx * eye[0] + -fy * eye[1] + -fz * eye[2]);

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

/**
 * Create a frustum from camera parameters.
 */
function createFrustum(
  eye: [number, number, number],
  target: [number, number, number],
  fov: number = Math.PI / 4,
  near: number = 0.001,
  far: number = 1000
): Frustum {
  const proj = createPerspectiveMatrix(fov, 1.0, near, far);
  const view = createLookAtMatrix(eye, target, [0, 1, 0]);
  const vp = multiplyMatrices(proj, view);
  return Frustum.fromViewProjection(vp);
}

describe('LODSelector', () => {
  // --- Construction ---

  describe('construction', () => {
    it('creates with default config', () => {
      const selector = new LODSelector();

      expect(selector.config.maxPixelError).toBe(4.0);
      expect(selector.config.maxLodLevel).toBe(12);
      expect(selector.config.morphRatio).toBe(0.8);
    });

    it('accepts partial config', () => {
      const selector = new LODSelector({
        maxPixelError: 2.0,
        maxLodLevel: 8,
      });

      expect(selector.config.maxPixelError).toBe(2.0);
      expect(selector.config.maxLodLevel).toBe(8);
      expect(selector.config.morphRatio).toBe(0.8); // Default preserved
    });

    it('initializes ranges on construction', () => {
      const selector = new LODSelector({ maxLodLevel: 4 });

      expect(selector.ranges.length).toBe(5); // 0 through 4
    });
  });

  // --- Range Calculation ---

  describe('updateRanges', () => {
    it('creates ranges for all LOD levels', () => {
      const selector = new LODSelector({ maxLodLevel: 8 });
      selector.updateRanges(1080, Math.PI / 4);

      expect(selector.ranges.length).toBe(9); // 0 through 8
    });

    it('coarser levels have larger distances', () => {
      const selector = new LODSelector({ maxLodLevel: 8 });
      selector.updateRanges(1080, Math.PI / 4);

      // LOD 0 (coarsest) should have largest distance
      // LOD 8 (finest) should have smallest distance
      for (let i = 1; i < selector.ranges.length; i++) {
        expect(selector.ranges[i]!.distance).toBeLessThan(
          selector.ranges[i - 1]!.distance
        );
      }
    });

    it('distances double for each coarser level', () => {
      const selector = new LODSelector({ maxLodLevel: 8 });
      selector.updateRanges(1080, Math.PI / 4);

      for (let i = 1; i < selector.ranges.length; i++) {
        const ratio = selector.ranges[i - 1]!.distance / selector.ranges[i]!.distance;
        expect(ratio).toBeCloseTo(2.0, 5);
      }
    });

    it('morphStart < distance for all levels', () => {
      const selector = new LODSelector({ maxLodLevel: 8, morphRatio: 0.8 });
      selector.updateRanges(1080, Math.PI / 4);

      for (const range of selector.ranges) {
        expect(range.morphStart).toBeLessThan(range.distance);
        expect(range.morphStart).toBeCloseTo(range.distance * 0.8, 5);
      }
    });

    it('larger screen increases distances', () => {
      const selector = new LODSelector({ maxLodLevel: 4 });

      selector.updateRanges(1080, Math.PI / 4);
      const dist1080 = selector.ranges[2]!.distance;

      selector.updateRanges(2160, Math.PI / 4); // 4K
      const dist2160 = selector.ranges[2]!.distance;

      // 4K needs higher detail at same distance, so threshold increases
      expect(dist2160).toBeGreaterThan(dist1080);
      expect(dist2160).toBeCloseTo(dist1080 * 2, 1); // Roughly double
    });

    it('narrower FOV increases distances', () => {
      const selector = new LODSelector({ maxLodLevel: 4 });

      selector.updateRanges(1080, Math.PI / 4); // 45°
      const distWide = selector.ranges[2]!.distance;

      selector.updateRanges(1080, Math.PI / 8); // 22.5° (zoomed in)
      const distNarrow = selector.ranges[2]!.distance;

      // Zoomed in needs higher detail, so threshold increases
      expect(distNarrow).toBeGreaterThan(distWide);
    });

    it('lower maxPixelError increases distances', () => {
      const selector1 = new LODSelector({ maxLodLevel: 4, maxPixelError: 4.0 });
      const selector2 = new LODSelector({ maxLodLevel: 4, maxPixelError: 2.0 });

      selector1.updateRanges(1080, Math.PI / 4);
      selector2.updateRanges(1080, Math.PI / 4);

      // Lower error tolerance = higher quality = larger distances
      expect(selector2.ranges[2]!.distance).toBeGreaterThan(
        selector1.ranges[2]!.distance
      );
    });
  });

  // --- Node Selection ---

  describe('selectNodes', () => {
    let tree: QuadTree;
    let selector: LODSelector;

    beforeEach(() => {
      tree = new QuadTree();
      selector = new LODSelector({
        maxLodLevel: 4,
        maxPixelError: 4.0,
      });
      selector.updateRanges(1080, Math.PI / 4);
    });

    it('returns nodes for visible cube faces', () => {
      // Camera looking at +Z face from distance
      const cameraPos = new Float64Array([0, 0, 5]);
      const frustum = createFrustum([0, 0, 5], [0, 0, 0]);

      const nodes = selector.selectNodes(tree, cameraPos, frustum);

      // Should have at least the +Z face visible
      expect(nodes.length).toBeGreaterThan(0);

      // Check nodes have valid data
      for (const node of nodes) {
        expect(node.scale).toBeGreaterThan(0);
        expect(node.lodLevel).toBeGreaterThanOrEqual(0);
        expect(node.faceId).toBeGreaterThanOrEqual(0);
        expect(node.faceId).toBeLessThanOrEqual(5);
        expect(node.morphStart).toBeLessThan(node.morphEnd);
      }
    });

    it('returns visible nodes from multiple faces', () => {
      // Camera at moderate distance can see multiple faces
      const cameraPos = new Float64Array([0, 0, 3]);
      const frustum = createFrustum([0, 0, 3], [0, 0, 0], Math.PI / 4, 0.01, 100);

      const nodes = selector.selectNodes(tree, cameraPos, frustum);

      // Should have nodes from multiple faces
      const facesWithNodes = new Set(nodes.map((n) => n.faceId));
      expect(facesWithNodes.size).toBeGreaterThan(1);

      // All selected nodes should have valid data
      for (const node of nodes) {
        expect(node.scale).toBeGreaterThan(0);
        expect(node.lodLevel).toBeGreaterThanOrEqual(0);
        expect(node.faceId).toBeGreaterThanOrEqual(0);
        expect(node.faceId).toBeLessThanOrEqual(5);
      }
    });

    it('uses higher LOD levels when camera is closer', () => {
      // Use higher maxLodLevel to see difference
      const testSelector = new LODSelector({ maxLodLevel: 8, maxPixelError: 4.0 });
      testSelector.updateRanges(1080, Math.PI / 4);

      const testTree = new QuadTree();

      // Far camera - should use low LOD
      const frustumFar = createFrustum([0, 0, 50], [0, 0, 0], Math.PI / 4, 0.1, 1000);
      testSelector.selectNodes(testTree, new Float64Array([0, 0, 50]), frustumFar);
      const maxLodFar = testSelector.stats.maxLodLevel;

      testTree.reset();

      // Close camera - should use higher LOD
      const frustumClose = createFrustum([0, 0, 1.2], [0, 0, 0], Math.PI / 4, 0.001, 100);
      testSelector.selectNodes(testTree, new Float64Array([0, 0, 1.2]), frustumClose);
      const maxLodClose = testSelector.stats.maxLodLevel;

      // Closer camera should trigger higher LOD levels
      expect(maxLodClose).toBeGreaterThan(maxLodFar);
    });

    it('higher LOD levels when camera is very close', () => {
      // Very close camera should trigger subdivision
      const cameraPos = new Float64Array([0, 0, 1.1]); // Just outside unit sphere
      const frustum = createFrustum([0, 0, 1.1], [0, 0, 0], Math.PI / 4, 0.001, 100);

      const nodes = selector.selectNodes(tree, cameraPos, frustum);

      // Should have some nodes with LOD > 0
      const maxLod = Math.max(...nodes.map((n) => n.lodLevel));
      expect(maxLod).toBeGreaterThan(0);
    });

    it('Node origins are stored in UV space for flat patches', () => {
      const cameraPos = new Float64Array([0, 0, 5]);
      const frustum = createFrustum([0, 0, 5], [0, 0, 0]);

      const nodes = selector.selectNodes(tree, cameraPos, frustum);

      // NodeData stores UV origin in relativeOrigin (u, v, 0) for M11.
      for (const node of nodes) {
        expect(node.relativeOrigin[2]).toBe(0);
        expect(node.relativeOrigin[0]).toBeGreaterThanOrEqual(0);
        expect(node.relativeOrigin[0]).toBeLessThanOrEqual(1);
        expect(node.relativeOrigin[1]).toBeGreaterThanOrEqual(0);
        expect(node.relativeOrigin[1]).toBeLessThanOrEqual(1);
      }
    });

    it('stats are updated after selection', () => {
      const cameraPos = new Float64Array([0, 0, 5]);
      const frustum = createFrustum([0, 0, 5], [0, 0, 0]);

      const nodes = selector.selectNodes(tree, cameraPos, frustum);
      const stats = selector.stats;

      expect(stats.nodesVisited).toBeGreaterThan(0);
      expect(stats.nodesSelected).toBe(nodes.length);
      expect(stats.nodesCulled).toBeGreaterThanOrEqual(0);
      expect(stats.nodesPerLevel.reduce((a, b) => a + b, 0)).toBe(nodes.length);
    });
  });

  // --- Tree Modification ---

  describe('tree modification', () => {
    it('subdivides nodes when needed', () => {
      const tree = new QuadTree();
      const selector = new LODSelector({ maxLodLevel: 4 });
      selector.updateRanges(1080, Math.PI / 4);

      // Very close camera should trigger subdivision
      const cameraPos = new Float64Array([0, 0, 1.05]);
      const frustum = createFrustum([0, 0, 1.05], [0, 0, 0], Math.PI / 4, 0.001, 100);

      // Initially all roots are leaves
      expect(tree.getRoot(0).isLeaf).toBe(true);

      selector.selectNodes(tree, cameraPos, frustum);

      // +Z face should now be subdivided
      expect(tree.getRoot(0).isSubdivided).toBe(true);
    });

    it('collapses nodes when camera moves away', () => {
      const tree = new QuadTree();
      const selector = new LODSelector({ maxLodLevel: 4, maxPixelError: 4.0 });
      selector.updateRanges(1080, Math.PI / 4);

      // First, get close to trigger subdivision
      const closePos = new Float64Array([0, 0, 1.05]);
      const closeFrustum = createFrustum([0, 0, 1.05], [0, 0, 0], Math.PI / 4, 0.001, 100);
      selector.selectNodes(tree, closePos, closeFrustum);

      const subdividedAfterClose = tree.getRoot(0).isSubdivided;
      const maxLodClose = selector.stats.maxLodLevel;

      // Now move very far away - beyond the coarsest LOD range
      // LOD 0 range is roughly: (1/16 * 540) / 4 * 16 = 540 units
      // So at 1000 units, we should be well beyond all subdivision thresholds
      const farPos = new Float64Array([0, 0, 1000]);
      const farFrustum = createFrustum([0, 0, 1000], [0, 0, 0], Math.PI / 4, 0.1, 10000);
      selector.selectNodes(tree, farPos, farFrustum);

      const maxLodFar = selector.stats.maxLodLevel;

      // When close, should have subdivision
      expect(subdividedAfterClose).toBe(true);
      expect(maxLodClose).toBeGreaterThan(0);

      // When far, should have lower LOD (root level only)
      expect(maxLodFar).toBe(0);
      expect(tree.getRoot(0).isLeaf).toBe(true);
    });
  });

  // --- Debug Utilities ---

  describe('debug utilities', () => {
    it('getLevelForDistance returns correct level', () => {
      const selector = new LODSelector({ maxLodLevel: 4 });
      selector.updateRanges(1080, Math.PI / 4);

      // Very far should be LOD 0
      expect(selector.getLevelForDistance(1000)).toBe(0);

      // Very close should be max LOD
      const finestRange = selector.ranges[4]!.distance;
      expect(selector.getLevelForDistance(finestRange * 0.5)).toBe(4);
    });

    it('formatRanges returns readable string', () => {
      const selector = new LODSelector({ maxLodLevel: 2 });
      selector.updateRanges(1080, Math.PI / 4);

      const formatted = selector.formatRanges();

      expect(formatted).toContain('LOD Ranges:');
      expect(formatted).toContain('LOD 0');
      expect(formatted).toContain('LOD 1');
      expect(formatted).toContain('LOD 2');
      expect(formatted).toContain('distance=');
      expect(formatted).toContain('morphStart=');
    });
  });
});

// --- NodeData Packing Tests ---

describe('NodeData packing', () => {
  it('packNodeData creates correct buffer size', () => {
    const nodes = [
      {
        relativeOrigin: [1, 2, 3] as const,
        scale: 0.5,
        lodLevel: 2,
        faceId: 0 as const,
        morphStart: 1.0,
        morphEnd: 2.0,
      },
      {
        relativeOrigin: [4, 5, 6] as const,
        scale: 0.25,
        lodLevel: 3,
        faceId: 1 as const,
        morphStart: 0.5,
        morphEnd: 1.0,
      },
    ];

    const buffer = packNodeData(nodes);

    expect(buffer.length).toBe(2 * NODE_DATA_FLOATS);
  });

  it('packNodeData preserves values', () => {
    const nodes = [
      {
        relativeOrigin: [1.5, -2.5, 3.5] as const,
        scale: 0.125,
        lodLevel: 5,
        faceId: 3 as const,
        morphStart: 0.8,
        morphEnd: 1.2,
      },
    ];

    const buffer = packNodeData(nodes);
    const bufferU32 = new Uint32Array(buffer.buffer);

    expect(buffer[0]).toBeCloseTo(1.5);
    expect(buffer[1]).toBeCloseTo(-2.5);
    expect(buffer[2]).toBeCloseTo(3.5);
    expect(buffer[3]).toBeCloseTo(0.125);
    expect(bufferU32[4]).toBe(5); // lodLevel
    expect(bufferU32[5]).toBe(3); // faceId
    expect(buffer[6]).toBeCloseTo(0.8);
    expect(buffer[7]).toBeCloseTo(1.2);
  });

  it('unpackNodeData reverses packNodeData', () => {
    const original = [
      {
        relativeOrigin: [1, 2, 3] as const,
        scale: 0.5,
        lodLevel: 2,
        faceId: 4 as const,
        morphStart: 1.0,
        morphEnd: 2.0,
      },
    ];

    const buffer = packNodeData(original);
    const unpacked = unpackNodeData(buffer, 1);

    expect(unpacked[0]!.relativeOrigin[0]).toBeCloseTo(original[0]!.relativeOrigin[0]);
    expect(unpacked[0]!.relativeOrigin[1]).toBeCloseTo(original[0]!.relativeOrigin[1]);
    expect(unpacked[0]!.relativeOrigin[2]).toBeCloseTo(original[0]!.relativeOrigin[2]);
    expect(unpacked[0]!.scale).toBeCloseTo(original[0]!.scale);
    expect(unpacked[0]!.lodLevel).toBe(original[0]!.lodLevel);
    expect(unpacked[0]!.faceId).toBe(original[0]!.faceId);
    expect(unpacked[0]!.morphStart).toBeCloseTo(original[0]!.morphStart);
    expect(unpacked[0]!.morphEnd).toBeCloseTo(original[0]!.morphEnd);
  });
});
