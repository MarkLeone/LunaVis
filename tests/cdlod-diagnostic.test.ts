/**
 * Diagnostic tests for CDLOD terrain rendering (M11).
 *
 * These tests isolate each stage of the pipeline to identify
 * where the rendering failure occurs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { QuadTree } from '@/terrain/QuadTree';
import { LODSelector } from '@/terrain/LODSelector';
import { Frustum } from '@/terrain/Frustum';
import { createGridMesh } from '@/terrain/GridMesh';
import {
  NODE_DATA_SIZE,
  NODE_DATA_FLOATS,
  packNodeData,
  type NodeData,
} from '@/terrain/NodeData';
import { mat4 } from 'wgpu-matrix';

describe('CDLOD Diagnostic Tests', () => {
  // =================================================================
  // Stage 1: Node Selection
  // =================================================================
  describe('Stage 1: Node Selection', () => {
    let tree: QuadTree;
    let selector: LODSelector;

    beforeEach(() => {
      tree = new QuadTree();
      selector = new LODSelector({
        maxPixelError: 4.0,
        maxLodLevel: 12,
      });
      selector.updateRanges(1080, Math.PI / 4);
    });

    it('should select nodes with camera at origin', () => {
      const cameraPos = new Float64Array([0, 0, 0]);
      const nodes = selector.selectNodes(tree, cameraPos, null);

      console.log('[DIAG] Camera at origin:');
      console.log(`  Selected nodes: ${nodes.length}`);
      console.log(`  Stats:`, selector.stats);

      expect(nodes.length).toBeGreaterThan(0);
    });

    it('should select nodes with camera at (0, 0, 3)', () => {
      // This is the default CDLOD camera position from main.ts
      const cameraPos = new Float64Array([0, 0, 3]);
      const nodes = selector.selectNodes(tree, cameraPos, null);

      console.log('[DIAG] Camera at (0, 0, 3):');
      console.log(`  Selected nodes: ${nodes.length}`);
      console.log(`  Stats:`, selector.stats);
      console.log(`  LOD ranges:`, selector.ranges.slice(0, 5));

      expect(nodes.length).toBeGreaterThan(0);
    });

    it('should select nodes with frustum culling enabled', () => {
      const cameraPos = new Float64Array([0, 0, 3]);

      // Create a view-projection matrix looking at origin
      const view = mat4.lookAt([0, 0, 3], [0, 0, 0], [0, 1, 0]);
      const proj = mat4.perspective(Math.PI / 4, 1.0, 0.1, 100);
      const viewProj = mat4.multiply(proj, view);

      const frustum = Frustum.fromViewProjection(viewProj as Float32Array);
      const nodes = selector.selectNodes(tree, cameraPos, frustum);

      console.log('[DIAG] With frustum culling:');
      console.log(`  Selected nodes: ${nodes.length}`);
      console.log(`  Culled nodes: ${selector.stats.nodesCulled}`);
      console.log(`  Visited nodes: ${selector.stats.nodesVisited}`);

      expect(nodes.length).toBeGreaterThan(0);
    });

    it('should produce valid NodeData with correct faceIds', () => {
      const cameraPos = new Float64Array([0, 0, 3]);
      const nodes = selector.selectNodes(tree, cameraPos, null);

      // Check all 6 faces are represented (or at least front face)
      const faceIds = new Set(nodes.map((n) => n.faceId));
      console.log('[DIAG] Face IDs in selection:', Array.from(faceIds));

      // Verify NodeData structure
      for (const node of nodes.slice(0, 5)) {
        console.log('[DIAG] Sample node:', {
          relativeOrigin: node.relativeOrigin,
          scale: node.scale,
          lodLevel: node.lodLevel,
          faceId: node.faceId,
          morphStart: node.morphStart,
          morphEnd: node.morphEnd,
        });

        expect(node.relativeOrigin).toBeDefined();
        expect(node.scale).toBeGreaterThan(0);
        expect(node.lodLevel).toBeGreaterThanOrEqual(0);
        expect(node.faceId).toBeGreaterThanOrEqual(0);
        expect(node.faceId).toBeLessThanOrEqual(5);
      }
    });
  });

  // =================================================================
  // Stage 2: Grid Mesh Generation
  // =================================================================
  describe('Stage 2: Grid Mesh Generation', () => {
    it('should create valid grid mesh', () => {
      const grid = createGridMesh(32);

      console.log('[DIAG] Grid mesh:');
      console.log(`  Vertices: ${grid.vertexCount}`);
      console.log(`  Triangles: ${grid.triangleCount}`);
      console.log(`  Position floats: ${grid.positions.length}`);
      console.log(`  Triangle indices: ${grid.triangleIndices.length}`);
      console.log(`  Line indices: ${grid.lineIndices.length}`);

      expect(grid.vertexCount).toBe(33 * 33); // (32+1)^2
      expect(grid.triangleCount).toBe(32 * 32 * 2);
      expect(grid.positions.length).toBe(grid.vertexCount * 2);
      expect(grid.triangleIndices.length).toBe(grid.triangleCount * 3);
    });

    it('should have UV coordinates in 0..1 range', () => {
      const grid = createGridMesh(32);

      let minU = Infinity, maxU = -Infinity;
      let minV = Infinity, maxV = -Infinity;

      for (let i = 0; i < grid.positions.length; i += 2) {
        const u = grid.positions[i]!;
        const v = grid.positions[i + 1]!;
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
        minV = Math.min(minV, v);
        maxV = Math.max(maxV, v);
      }

      console.log('[DIAG] UV range:', { minU, maxU, minV, maxV });

      expect(minU).toBeCloseTo(0, 5);
      expect(maxU).toBeCloseTo(1, 5);
      expect(minV).toBeCloseTo(0, 5);
      expect(maxV).toBeCloseTo(1, 5);
    });
  });

  // =================================================================
  // Stage 3: NodeData Packing
  // =================================================================
  describe('Stage 3: NodeData Packing', () => {
    it('should pack NodeData with correct size', () => {
      const nodes: NodeData[] = [
        {
          relativeOrigin: [0.5, 0.5, 0],
          scale: 0.25,
          lodLevel: 2,
          faceId: 0,
          morphStart: 1.0,
          morphEnd: 1.5,
        },
      ];

      const packed = packNodeData(nodes);

      console.log('[DIAG] Packed NodeData:');
      console.log(`  Buffer length (floats): ${packed.length}`);
      console.log(`  Buffer byte length: ${packed.byteLength}`);
      console.log(`  Expected size: ${NODE_DATA_SIZE} bytes per node`);
      console.log(`  NODE_DATA_FLOATS: ${NODE_DATA_FLOATS}`);

      expect(packed.length).toBe(NODE_DATA_FLOATS);
      expect(packed.byteLength).toBe(NODE_DATA_SIZE);
    });

    it('should pack faceId and lodLevel as u32', () => {
      const nodes: NodeData[] = [
        {
          relativeOrigin: [0.25, 0.75, 0],
          scale: 0.5,
          lodLevel: 5,
          faceId: 3,
          morphStart: 2.0,
          morphEnd: 3.0,
        },
      ];

      const packed = packNodeData(nodes);
      const packedU32 = new Uint32Array(packed.buffer);

      console.log('[DIAG] Packed data (float view):', Array.from(packed));
      console.log('[DIAG] Packed data (u32 view at offset 4-5):', [
        packedU32[4],
        packedU32[5],
      ]);

      // lodLevel at offset 4, faceId at offset 5 (in u32 units)
      expect(packedU32[4]).toBe(5); // lodLevel
      expect(packedU32[5]).toBe(3); // faceId
    });
  });

  // =================================================================
  // Stage 4: Shader Position Calculation (simulated)
  // =================================================================
  describe('Stage 4: Shader Position Calculation', () => {
    /**
     * Simulates the uvToCubePos function from terrain-flat.wgsl
     */
    function uvToCubePos(faceId: number, u: number, v: number): [number, number, number] {
      const uc = 2.0 * u - 1.0;
      const vc = 2.0 * v - 1.0;

      switch (faceId) {
        case 0: return [uc, vc, 1.0];   // +Z (front)
        case 1: return [-uc, vc, -1.0]; // -Z (back)
        case 2: return [1.0, vc, -uc];  // +X (right)
        case 3: return [-1.0, vc, uc];  // -X (left)
        case 4: return [uc, 1.0, -vc];  // +Y (top)
        default: return [uc, -1.0, vc]; // -Y (bottom)
      }
    }

    it('should produce cube positions in -1..1 range', () => {
      // Test corners and center of face 0 (+Z)
      const testCases = [
        { u: 0, v: 0, expected: [-1, -1, 1] },
        { u: 1, v: 0, expected: [1, -1, 1] },
        { u: 0, v: 1, expected: [-1, 1, 1] },
        { u: 1, v: 1, expected: [1, 1, 1] },
        { u: 0.5, v: 0.5, expected: [0, 0, 1] },
      ];

      console.log('[DIAG] Face 0 (+Z) cube positions:');
      for (const { u, v, expected } of testCases) {
        const pos = uvToCubePos(0, u, v);
        console.log(`  UV(${u}, ${v}) -> (${pos[0].toFixed(2)}, ${pos[1].toFixed(2)}, ${pos[2].toFixed(2)})`);
        expect(pos[0]).toBeCloseTo(expected[0], 5);
        expect(pos[1]).toBeCloseTo(expected[1], 5);
        expect(pos[2]).toBeCloseTo(expected[2], 5);
      }
    });

    it('should produce positions that transform to valid clip space', () => {
      // Camera at (0, 0, 3) looking at origin
      const view = mat4.lookAt([0, 0, 3], [0, 0, 0], [0, 1, 0]);
      const proj = mat4.perspective(Math.PI / 4, 1.0, 0.1, 100);
      const viewProj = mat4.multiply(proj, view);

      // Test center of front face (should be visible)
      const cubePos = uvToCubePos(0, 0.5, 0.5);
      const worldPos = new Float32Array([cubePos[0], cubePos[1], cubePos[2], 1.0]);
      const clipPos = new Float32Array(4);

      // Manual matrix-vector multiply (column-major layout)
      for (let row = 0; row < 4; row++) {
        clipPos[row] = 0;
        for (let col = 0; col < 4; col++) {
          clipPos[row]! += (viewProj as Float32Array)[col * 4 + row]! * worldPos[col]!;
        }
      }

      // Perspective divide
      const ndcX = clipPos[0]! / clipPos[3]!;
      const ndcY = clipPos[1]! / clipPos[3]!;
      const ndcZ = clipPos[2]! / clipPos[3]!;

      console.log('[DIAG] Front face center transformation:');
      console.log(`  World pos: (${cubePos[0]}, ${cubePos[1]}, ${cubePos[2]})`);
      console.log(`  Clip pos: (${clipPos[0]?.toFixed(3)}, ${clipPos[1]?.toFixed(3)}, ${clipPos[2]?.toFixed(3)}, ${clipPos[3]?.toFixed(3)})`);
      console.log(`  NDC: (${ndcX.toFixed(3)}, ${ndcY.toFixed(3)}, ${ndcZ.toFixed(3)})`);

      // Check that position is within NDC range (-1 to 1 for x/y, 0 to 1 for z in WebGPU)
      expect(ndcX).toBeGreaterThanOrEqual(-1);
      expect(ndcX).toBeLessThanOrEqual(1);
      expect(ndcY).toBeGreaterThanOrEqual(-1);
      expect(ndcY).toBeLessThanOrEqual(1);
      expect(ndcZ).toBeGreaterThanOrEqual(0);
      expect(ndcZ).toBeLessThanOrEqual(1);
    });

    it('should verify all 6 cube faces produce valid positions', () => {
      const view = mat4.lookAt([0, 0, 3], [0, 0, 0], [0, 1, 0]);
      const proj = mat4.perspective(Math.PI / 4, 1.0, 0.1, 100);
      const viewProj = mat4.multiply(proj, view);

      const faceNames = ['+Z (front)', '-Z (back)', '+X (right)', '-X (left)', '+Y (top)', '-Y (bottom)'];

      console.log('[DIAG] All face centers:');
      for (let faceId = 0; faceId < 6; faceId++) {
        const cubePos = uvToCubePos(faceId, 0.5, 0.5);
        const worldPos = new Float32Array([cubePos[0], cubePos[1], cubePos[2], 1.0]);
        const clipPos = new Float32Array(4);

        for (let row = 0; row < 4; row++) {
          clipPos[row] = 0;
          for (let col = 0; col < 4; col++) {
            clipPos[row]! += (viewProj as Float32Array)[col * 4 + row]! * worldPos[col]!;
          }
        }

        const w = clipPos[3]!;
        const ndcX = clipPos[0]! / w;
        const ndcY = clipPos[1]! / w;
        const ndcZ = clipPos[2]! / w;
        const visible = ndcX >= -1 && ndcX <= 1 && ndcY >= -1 && ndcY <= 1 && ndcZ >= 0 && ndcZ <= 1 && w > 0;

        console.log(`  Face ${faceId} ${faceNames[faceId]}: world(${cubePos.map(x => x.toFixed(1)).join(', ')}) -> NDC(${ndcX.toFixed(2)}, ${ndcY.toFixed(2)}, ${ndcZ.toFixed(2)}) ${visible ? '✓ visible' : '✗ culled'}`);
      }
    });
  });

  // =================================================================
  // Stage 5: View-Projection Matrix Verification
  // =================================================================
  describe('Stage 5: View-Projection Matrix', () => {
    it('should verify camera produces valid view-projection matrix', () => {
      // Simulate Camera class behavior
      const position = [0, 0, 3] as const;
      const target = [0, 0, 0] as const;
      const up = [0, 1, 0] as const;
      const fov = Math.PI / 4;
      const aspect = 1.0;
      const near = 0.01;
      const far = 1000;

      const view = mat4.lookAt(position, target, up);
      const proj = mat4.perspective(fov, aspect, near, far);
      const viewProj = mat4.multiply(proj, view);

      console.log('[DIAG] View matrix (first row):', Array.from(view as Float32Array).slice(0, 4).map(x => x.toFixed(3)));
      console.log('[DIAG] Projection matrix (first row):', Array.from(proj as Float32Array).slice(0, 4).map(x => x.toFixed(3)));
      console.log('[DIAG] ViewProj matrix (first row):', Array.from(viewProj as Float32Array).slice(0, 4).map(x => x.toFixed(3)));

      // Verify matrix is not all zeros or identity
      const vpArray = Array.from(viewProj as Float32Array);
      const hasNonZero = vpArray.some(v => Math.abs(v) > 0.001);
      const isNotIdentity = vpArray.some((v, i) => {
        const isOnDiagonal = i % 5 === 0;
        return isOnDiagonal ? Math.abs(v - 1) > 0.001 : Math.abs(v) > 0.001;
      });

      expect(hasNonZero).toBe(true);
      expect(isNotIdentity).toBe(true);
    });
  });

  // =================================================================
  // Stage 6: Integration Test (simulated render)
  // =================================================================
  describe('Stage 6: Full Pipeline Integration', () => {
    it('should produce renderable data from camera to NodeData', () => {
      // 1. Setup
      const tree = new QuadTree();
      const selector = new LODSelector({
        maxPixelError: 4.0,
        maxLodLevel: 12,
      });
      selector.updateRanges(1080, Math.PI / 4);

      // 2. Camera setup (matching main.ts)
      const cameraPos = new Float64Array([0, 0, 3]);

      // 3. Select nodes
      const nodes = selector.selectNodes(tree, cameraPos, null);

      console.log('[DIAG] Integration test results:');
      console.log(`  Nodes selected: ${nodes.length}`);

      // 4. Verify we have nodes to render
      expect(nodes.length).toBeGreaterThan(0);

      // 5. Pack for GPU
      const packed = packNodeData(nodes);
      console.log(`  Packed buffer size: ${packed.byteLength} bytes`);
      console.log(`  Expected size: ${nodes.length * NODE_DATA_SIZE} bytes`);

      expect(packed.byteLength).toBe(nodes.length * NODE_DATA_SIZE);

      // 6. Verify first few nodes have face 0 (+Z) which should be visible
      const frontFaceNodes = nodes.filter(n => n.faceId === 0);
      console.log(`  Front face (+Z) nodes: ${frontFaceNodes.length}`);

      // We expect at least some front face nodes to be selected
      // since camera is at +Z looking at origin
      expect(frontFaceNodes.length).toBeGreaterThan(0);
    });
  });
});
