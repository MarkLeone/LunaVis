/**
 * Unit tests for QuadNode and QuadTree classes.
 * Tests cover construction, coordinate conversion, bounding spheres,
 * subdivision, collapse, traversal, and double-precision accuracy.
 */

import { describe, it, expect } from 'vitest';
import { QuadNode, Quadrant } from '@/terrain/QuadNode';
import { QuadTree } from '@/terrain/QuadTree';
import type { FaceId } from '@/types';

describe('QuadNode', () => {
  // --- Construction ---

  describe('construction', () => {
    it('creates root node with correct properties', () => {
      const node = new QuadNode({
        faceId: 0,
        lodLevel: 0,
        u: 0,
        v: 0,
        size: 1,
        parent: null,
      });

      expect(node.faceId).toBe(0);
      expect(node.lodLevel).toBe(0);
      expect(node.origin).toEqual([0, 0]);
      expect(node.size).toBe(1);
      expect(node.parent).toBeNull();
      expect(node.isLeaf).toBe(true);
      expect(node.isSubdivided).toBe(false);
    });

    it('computes UV center correctly', () => {
      const node = new QuadNode({
        faceId: 0,
        lodLevel: 0,
        u: 0.25,
        v: 0.5,
        size: 0.5,
        parent: null,
      });

      const center = node.uvCenter;
      expect(center[0]).toBeCloseTo(0.5);
      expect(center[1]).toBeCloseTo(0.75);
    });

    it('generates unique ID from face, LOD, and position', () => {
      const node = new QuadNode({
        faceId: 2,
        lodLevel: 3,
        u: 0.125,
        v: 0.25,
        size: 0.125,
        parent: null,
      });

      expect(node.id).toContain('f2');
      expect(node.id).toContain('L3');
    });
  });

  // --- Coordinate Conversion ---

  describe('uvToCubeDirection', () => {
    const testCases: Array<{
      faceId: FaceId;
      u: number;
      v: number;
      expected: [number, number, number];
      name: string;
    }> = [
      // Face 0 (+Z): center should be (0, 0, 1)
      { faceId: 0, u: 0.5, v: 0.5, expected: [0, 0, 1], name: '+Z center' },
      // Face 0 (+Z): corner (0, 0) should be (-1, -1, 1)
      { faceId: 0, u: 0, v: 0, expected: [-1, -1, 1], name: '+Z corner SW' },
      // Face 0 (+Z): corner (1, 1) should be (1, 1, 1)
      { faceId: 0, u: 1, v: 1, expected: [1, 1, 1], name: '+Z corner NE' },
      // Face 1 (-Z): center should be (0, 0, -1)
      { faceId: 1, u: 0.5, v: 0.5, expected: [0, 0, -1], name: '-Z center' },
      // Face 2 (+X): center should be (1, 0, 0)
      { faceId: 2, u: 0.5, v: 0.5, expected: [1, 0, 0], name: '+X center' },
      // Face 3 (-X): center should be (-1, 0, 0)
      { faceId: 3, u: 0.5, v: 0.5, expected: [-1, 0, 0], name: '-X center' },
      // Face 4 (+Y): center should be (0, 1, 0)
      { faceId: 4, u: 0.5, v: 0.5, expected: [0, 1, 0], name: '+Y center' },
      // Face 5 (-Y): center should be (0, -1, 0)
      { faceId: 5, u: 0.5, v: 0.5, expected: [0, -1, 0], name: '-Y center' },
    ];

    it.each(testCases)('$name: face $faceId at ($u, $v)', ({ faceId, u, v, expected }) => {
      const node = new QuadNode({
        faceId,
        lodLevel: 0,
        u: 0,
        v: 0,
        size: 1,
        parent: null,
      });

      const dir = node.uvToCubeDirection(u, v);
      expect(dir[0]).toBeCloseTo(expected[0]);
      expect(dir[1]).toBeCloseTo(expected[1]);
      expect(dir[2]).toBeCloseTo(expected[2]);
    });
  });

  describe('sphere projection', () => {
    it('normalizes cube direction to unit sphere', () => {
      const cubeDir = new Float64Array([1, 1, 1]);
      const spherePoint = QuadNode.normalizeToSphere(cubeDir);

      // Should be unit length
      const len = Math.sqrt(
        spherePoint[0]! ** 2 + spherePoint[1]! ** 2 + spherePoint[2]! ** 2
      );
      expect(len).toBeCloseTo(1);

      // Should point in same direction
      const invSqrt3 = 1 / Math.sqrt(3);
      expect(spherePoint[0]).toBeCloseTo(invSqrt3);
      expect(spherePoint[1]).toBeCloseTo(invSqrt3);
      expect(spherePoint[2]).toBeCloseTo(invSqrt3);
    });

    it('handles zero vector gracefully', () => {
      const cubeDir = new Float64Array([0, 0, 0]);
      const spherePoint = QuadNode.normalizeToSphere(cubeDir);

      // Should return fallback direction
      expect(spherePoint[2]).toBeCloseTo(1);
    });

    it('root node center on +Z face is (0, 0, 1)', () => {
      const node = new QuadNode({
        faceId: 0,
        lodLevel: 0,
        u: 0,
        v: 0,
        size: 1,
        parent: null,
      });

      const center = node.sphereCenter;
      expect(center[0]).toBeCloseTo(0);
      expect(center[1]).toBeCloseTo(0);
      expect(center[2]).toBeCloseTo(1);
    });

    it('root node center on +Y face is (0, 1, 0)', () => {
      const node = new QuadNode({
        faceId: 4,
        lodLevel: 0,
        u: 0,
        v: 0,
        size: 1,
        parent: null,
      });

      const center = node.sphereCenter;
      expect(center[0]).toBeCloseTo(0);
      expect(center[1]).toBeCloseTo(1);
      expect(center[2]).toBeCloseTo(0);
    });
  });

  // --- Bounding Sphere ---

  describe('boundingSphere', () => {
    it('root node bounding sphere has center on unit sphere', () => {
      const node = new QuadNode({
        faceId: 0,
        lodLevel: 0,
        u: 0,
        v: 0,
        size: 1,
        parent: null,
      });

      const bs = node.boundingSphere;

      // Center should be on unit sphere
      const len = Math.sqrt(
        bs.center[0]! ** 2 + bs.center[1]! ** 2 + bs.center[2]! ** 2
      );
      expect(len).toBeCloseTo(1);
    });

    it('root node bounding sphere encompasses face corners', () => {
      const node = new QuadNode({
        faceId: 0,
        lodLevel: 0,
        u: 0,
        v: 0,
        size: 1,
        parent: null,
      });

      const bs = node.boundingSphere;

      // Radius should be large enough to cover face diagonal
      // Corner at (-1, -1, 1) normalized has distance from center
      expect(bs.radius).toBeGreaterThan(0.8);
      expect(bs.radius).toBeLessThan(1.5);
    });

    it('child node has smaller bounding sphere', () => {
      const parent = new QuadNode({
        faceId: 0,
        lodLevel: 0,
        u: 0,
        v: 0,
        size: 1,
        parent: null,
      });

      const children = parent.subdivide();
      const child = children[0]!;

      expect(child.boundingSphere.radius).toBeLessThan(parent.boundingSphere.radius);
    });

    it('bounding sphere is cached', () => {
      const node = new QuadNode({
        faceId: 0,
        lodLevel: 0,
        u: 0,
        v: 0,
        size: 1,
        parent: null,
      });

      const bs1 = node.boundingSphere;
      const bs2 = node.boundingSphere;

      expect(bs1).toBe(bs2); // Same object reference
    });
  });

  // --- Subdivision ---

  describe('subdivision', () => {
    it('creates 4 children with correct properties', () => {
      const parent = new QuadNode({
        faceId: 2,
        lodLevel: 0,
        u: 0,
        v: 0,
        size: 1,
        parent: null,
      });

      const children = parent.subdivide();

      expect(children.length).toBe(4);
      expect(parent.isSubdivided).toBe(true);
      expect(parent.isLeaf).toBe(false);

      // Check each child
      for (const child of children) {
        expect(child.faceId).toBe(2);
        expect(child.lodLevel).toBe(1);
        expect(child.size).toBe(0.5);
        expect(child.parent).toBe(parent);
      }
    });

    it('positions children correctly', () => {
      const parent = new QuadNode({
        faceId: 0,
        lodLevel: 0,
        u: 0,
        v: 0,
        size: 1,
        parent: null,
      });

      const children = parent.subdivide();

      // SW (bottom-left)
      expect(children[Quadrant.SW].origin).toEqual([0, 0]);
      // SE (bottom-right)
      expect(children[Quadrant.SE].origin).toEqual([0.5, 0]);
      // NW (top-left)
      expect(children[Quadrant.NW].origin).toEqual([0, 0.5]);
      // NE (top-right)
      expect(children[Quadrant.NE].origin).toEqual([0.5, 0.5]);
    });

    it('throws when subdividing already subdivided node', () => {
      const node = new QuadNode({
        faceId: 0,
        lodLevel: 0,
        u: 0,
        v: 0,
        size: 1,
        parent: null,
      });

      node.subdivide();
      expect(() => node.subdivide()).toThrow('already subdivided');
    });

    it('throws when subdividing beyond max LOD', () => {
      const node = new QuadNode({
        faceId: 0,
        lodLevel: QuadNode.MAX_LOD_LEVEL,
        u: 0,
        v: 0,
        size: 1 / 2 ** QuadNode.MAX_LOD_LEVEL,
        parent: null,
      });

      expect(() => node.subdivide()).toThrow('Cannot subdivide beyond');
    });

    it('supports deep subdivision to LOD 12+', () => {
      let node = new QuadNode({
        faceId: 0,
        lodLevel: 0,
        u: 0,
        v: 0,
        size: 1,
        parent: null,
      });

      // Subdivide to LOD 12
      for (let i = 0; i < 12; i++) {
        const children = node.subdivide();
        node = children[0]!; // Always take SW child
      }

      expect(node.lodLevel).toBe(12);
      expect(node.size).toBeCloseTo(1 / 4096);

      // Bounding sphere should still be valid
      const bs = node.boundingSphere;
      expect(bs.radius).toBeGreaterThan(0);
      expect(bs.radius).toBeLessThan(0.001);
    });
  });

  // --- Collapse ---

  describe('collapse', () => {
    it('removes all children', () => {
      const node = new QuadNode({
        faceId: 0,
        lodLevel: 0,
        u: 0,
        v: 0,
        size: 1,
        parent: null,
      });

      node.subdivide();
      expect(node.isSubdivided).toBe(true);

      node.collapse();
      expect(node.isSubdivided).toBe(false);
      expect(node.isLeaf).toBe(true);
      expect(node.children).toBeNull();
    });

    it('recursively collapses grandchildren', () => {
      const root = new QuadNode({
        faceId: 0,
        lodLevel: 0,
        u: 0,
        v: 0,
        size: 1,
        parent: null,
      });

      const children = root.subdivide();
      children[0]!.subdivide(); // Subdivide SW child

      root.collapse();

      expect(root.isLeaf).toBe(true);
    });

    it('is idempotent on leaf nodes', () => {
      const node = new QuadNode({
        faceId: 0,
        lodLevel: 0,
        u: 0,
        v: 0,
        size: 1,
        parent: null,
      });

      // Should not throw
      node.collapse();
      node.collapse();
      expect(node.isLeaf).toBe(true);
    });
  });
});

describe('QuadTree', () => {
  // --- Construction ---

  describe('construction', () => {
    it('creates 6 root nodes for cube faces', () => {
      const tree = new QuadTree();

      expect(tree.roots.length).toBe(6);

      for (let i = 0; i < 6; i++) {
        const root = tree.getRoot(i as FaceId);
        expect(root.faceId).toBe(i);
        expect(root.lodLevel).toBe(0);
        expect(root.size).toBe(1);
        expect(root.parent).toBeNull();
      }
    });
  });

  // --- Traversal ---

  describe('traversal', () => {
    it('traverse visits all nodes', () => {
      const tree = new QuadTree();
      tree.getRoot(0).subdivide();

      const visited: string[] = [];
      tree.traverse((node) => visited.push(node.id));

      // 6 roots + 4 children of face 0
      expect(visited.length).toBe(10);
    });

    it('collectLeaves returns only leaf nodes', () => {
      const tree = new QuadTree();
      tree.getRoot(0).subdivide();
      tree.getRoot(2).subdivide();

      const leaves = tree.collectLeaves();

      // 4 leaves from face 0 + 4 from face 2 + 4 unchanged roots
      expect(leaves.length).toBe(12);

      for (const leaf of leaves) {
        expect(leaf.isLeaf).toBe(true);
      }
    });

    it('collectLeavesWhere filters correctly', () => {
      const tree = new QuadTree();
      tree.getRoot(0).subdivide();

      const leaves = tree.collectLeavesWhere((node) => node.faceId === 0);

      // Only 4 children of face 0
      expect(leaves.length).toBe(4);
      for (const leaf of leaves) {
        expect(leaf.faceId).toBe(0);
      }
    });

    it('traverseConditional skips subtrees', () => {
      const tree = new QuadTree();
      const root0 = tree.getRoot(0);
      const children0 = root0.subdivide();
      children0[0]!.subdivide(); // SW grandchildren

      const visited: number[] = [];
      tree.traverseConditional(
        // Only descend into face 0
        (node) => node.faceId === 0,
        (node) => visited.push(node.lodLevel)
      );

      // Should visit face 0 hierarchy (1 + 4 + 4 = 9)
      // Plus 5 other roots (not descended)
      expect(visited.filter((l) => l === 0).length).toBe(6); // All roots
      expect(visited.filter((l) => l === 1).length).toBe(4); // Face 0 children
      expect(visited.filter((l) => l === 2).length).toBe(4); // SW grandchildren
    });
  });

  // --- Statistics ---

  describe('statistics', () => {
    it('getStats returns correct counts', () => {
      const tree = new QuadTree();
      tree.getRoot(0).subdivide();

      const stats = tree.getStats();

      expect(stats.totalNodes).toBe(10); // 6 + 4
      expect(stats.leafNodes).toBe(9); // 5 roots + 4 children
      expect(stats.maxLodLevel).toBe(1);
      expect(stats.nodesPerLevel[0]).toBe(6);
      expect(stats.nodesPerLevel[1]).toBe(4);
    });

    it('stats update after subdivision', () => {
      const tree = new QuadTree();

      let stats = tree.getStats();
      expect(stats.totalNodes).toBe(6);
      expect(stats.leafNodes).toBe(6);

      tree.getRoot(0).subdivide();
      stats = tree.getStats();
      expect(stats.totalNodes).toBe(10);
      expect(stats.leafNodes).toBe(9);
    });
  });

  // --- Reset ---

  describe('reset', () => {
    it('collapses all nodes to roots only', () => {
      const tree = new QuadTree();
      tree.getRoot(0).subdivide();
      tree.getRoot(1).subdivide();
      tree.getRoot(0).children![0]!.subdivide();

      tree.reset();

      const stats = tree.getStats();
      expect(stats.totalNodes).toBe(6);
      expect(stats.leafNodes).toBe(6);
      expect(stats.maxLodLevel).toBe(0);
    });
  });
});

describe('double precision', () => {
  it('maintains precision at high LOD levels', () => {
    let node = new QuadNode({
      faceId: 0,
      lodLevel: 0,
      u: 0,
      v: 0,
      size: 1,
      parent: null,
    });

    // Subdivide to LOD 12, always taking NE child
    for (let i = 0; i < 12; i++) {
      const children = node.subdivide();
      node = children[Quadrant.NE]!;
    }

    // At LOD 12, NE child is at u, v close to 1.0
    // Size is 1/4096 = 0.000244140625
    const [u, v] = node.origin;
    const expectedU = 1 - 1 / 4096; // 0.999755859375
    const expectedV = 1 - 1 / 4096;

    // With Float64Array, we should have ~15 digits of precision
    expect(u).toBeCloseTo(expectedU, 10);
    expect(v).toBeCloseTo(expectedV, 10);
    expect(node.size).toBeCloseTo(1 / 4096, 15);
  });

  it('sphere center is valid at LOD 12', () => {
    let node = new QuadNode({
      faceId: 0,
      lodLevel: 0,
      u: 0,
      v: 0,
      size: 1,
      parent: null,
    });

    for (let i = 0; i < 12; i++) {
      const children = node.subdivide();
      node = children[0]!;
    }

    const center = node.sphereCenter;
    const len = Math.sqrt(center[0]! ** 2 + center[1]! ** 2 + center[2]! ** 2);

    // Should be on unit sphere
    expect(len).toBeCloseTo(1, 10);
  });

  it('bounding sphere radius decreases with LOD', () => {
    const radii: number[] = [];
    let node = new QuadNode({
      faceId: 0,
      lodLevel: 0,
      u: 0,
      v: 0,
      size: 1,
      parent: null,
    });

    radii.push(node.boundingSphere.radius);

    for (let i = 0; i < 8; i++) {
      const children = node.subdivide();
      node = children[0]!;
      radii.push(node.boundingSphere.radius);
    }

    // Each level should have smaller radius
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]).toBeLessThan(radii[i - 1]!);
    }
  });
});
