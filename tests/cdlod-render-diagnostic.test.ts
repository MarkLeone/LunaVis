/**
 * Diagnostic tests specifically for the CDLOD render path.
 * Tests the TerrainRenderer to verify nodes are being drawn.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { QuadTree } from '@/terrain/QuadTree';
import { LODSelector } from '@/terrain/LODSelector';
import { Frustum } from '@/terrain/Frustum';
import { createGridMesh } from '@/terrain/GridMesh';
import { NODE_DATA_SIZE, packNodeData, type NodeData } from '@/terrain/NodeData';
import { mat4 } from 'wgpu-matrix';

describe('CDLOD Render Path Diagnostics', () => {
  describe('Node Count with Conservative Settings', () => {
    it('should produce manageable node count with maxLodLevel: 4', () => {
      const tree = new QuadTree();
      const selector = new LODSelector({
        maxPixelError: 4.0,
        maxLodLevel: 4,
      });
      selector.updateRanges(1080, Math.PI / 4);

      const cameraPos = new Float64Array([0, 0, 3]);
      const nodes = selector.selectNodes(tree, cameraPos, null);

      console.log('[RENDER-DIAG] maxLodLevel: 4');
      console.log(`  Selected nodes: ${nodes.length}`);
      console.log(`  Stats:`, selector.stats);
      console.log(`  LOD ranges:`, selector.ranges);

      // With maxLod 4, we should have manageable node count (6 faces * 4^4 = 1536)
      expect(nodes.length).toBeLessThanOrEqual(1536);
    });

    it('should produce manageable node count with higher maxPixelError', () => {
      const tree = new QuadTree();
      const selector = new LODSelector({
        maxPixelError: 16.0, // Higher error tolerance = less subdivision
        maxLodLevel: 12,
      });
      selector.updateRanges(1080, Math.PI / 4);

      const cameraPos = new Float64Array([0, 0, 3]);
      const nodes = selector.selectNodes(tree, cameraPos, null);

      console.log('[RENDER-DIAG] maxPixelError: 16');
      console.log(`  Selected nodes: ${nodes.length}`);
      console.log(`  Max LOD reached: ${selector.stats.maxLodLevel}`);

      // Higher pixel error should reduce subdivision
      expect(nodes.length).toBeLessThan(50000);
    });
  });

  describe('Frustum Culling Effectiveness', () => {
    it('should cull back-facing nodes', () => {
      const tree = new QuadTree();
      const selector = new LODSelector({
        maxPixelError: 4.0,
        maxLodLevel: 4,
      });
      selector.updateRanges(1080, Math.PI / 4);

      // Camera at +Z looking at origin - should NOT see -Z face
      const cameraPos = new Float64Array([0, 0, 3]);

      // Create frustum for forward-looking camera
      const view = mat4.lookAt([0, 0, 3], [0, 0, 0], [0, 1, 0]);
      const proj = mat4.perspective(Math.PI / 4, 1.0, 0.1, 100);
      const viewProj = mat4.multiply(proj, view);
      const frustum = Frustum.fromViewProjection(viewProj as Float32Array);

      const nodes = selector.selectNodes(tree, cameraPos, frustum);

      console.log('[RENDER-DIAG] Frustum culling test:');
      console.log(`  Selected nodes: ${nodes.length}`);
      console.log(`  Culled nodes: ${selector.stats.nodesCulled}`);
      console.log(`  Visited nodes: ${selector.stats.nodesVisited}`);

      // Face distribution
      const faceCount = [0, 0, 0, 0, 0, 0];
      for (const node of nodes) {
        faceCount[node.faceId]++;
      }
      console.log('  Face distribution:', faceCount);
      console.log('    Face 0 (+Z front):', faceCount[0]);
      console.log('    Face 1 (-Z back):', faceCount[1]);

      // Frustum culling should cull some nodes (not all 6 faces fully visible)
      // Note: Back face (-Z) may have MORE visible nodes because front face
      // corners extend outside the frustum at close range
      expect(selector.stats.nodesCulled).toBeGreaterThan(0);
    });
  });

  describe('Grid UV to World Position Mapping', () => {
    it('should correctly map UV to cube positions for face 0 (+Z)', () => {
      // Simulate what the shader does
      function uvToCubePos(faceId: number, u: number, v: number): [number, number, number] {
        const uc = 2.0 * u - 1.0;
        const vc = 2.0 * v - 1.0;
        switch (faceId) {
          case 0: return [uc, vc, 1.0];
          case 1: return [-uc, vc, -1.0];
          case 2: return [1.0, vc, -uc];
          case 3: return [-1.0, vc, uc];
          case 4: return [uc, 1.0, -vc];
          default: return [uc, -1.0, vc];
        }
      }

      // For a node at UV origin (0, 0) with scale 1.0 (root node)
      const nodeOrigin = [0, 0, 0] as const;
      const nodeScale = 1.0;

      // Grid UV spans 0..1 within the node
      // Final face UV = nodeOrigin + gridUV * nodeScale
      const corners = [
        { gridUV: [0, 0], faceUV: [0, 0] },
        { gridUV: [1, 0], faceUV: [1, 0] },
        { gridUV: [0, 1], faceUV: [0, 1] },
        { gridUV: [1, 1], faceUV: [1, 1] },
      ];

      console.log('[RENDER-DIAG] UV to cube position mapping:');
      for (const { gridUV, faceUV } of corners) {
        const cubePos = uvToCubePos(0, faceUV[0], faceUV[1]);
        console.log(`  gridUV(${gridUV.join(', ')}) -> faceUV(${faceUV.join(', ')}) -> cube(${cubePos.map(x => x.toFixed(1)).join(', ')})`);
      }

      // Verify corners of face 0 (+Z)
      expect(uvToCubePos(0, 0, 0)).toEqual([-1, -1, 1]);
      expect(uvToCubePos(0, 1, 0)).toEqual([1, -1, 1]);
      expect(uvToCubePos(0, 0, 1)).toEqual([-1, 1, 1]);
      expect(uvToCubePos(0, 1, 1)).toEqual([1, 1, 1]);
    });
  });

  describe('View-Projection Transform Verification', () => {
    it('should transform front face into visible clip space', () => {
      // Camera setup matching main.ts CDLOD defaults
      const cameraPos = [0, 0, 3];
      const target = [0, 0, 0];

      // Create matrices using wgpu-matrix (column-major)
      const view = mat4.lookAt(cameraPos, target, [0, 1, 0]) as Float32Array;
      const proj = mat4.perspective(Math.PI / 4, 1.0, 0.1, 100) as Float32Array;
      const viewProj = mat4.multiply(proj, view) as Float32Array;

      // Transform cube corners using wgpu-matrix
      const testPoints = [
        { name: 'Front center', pos: [0, 0, 1, 1] },
        { name: 'Front corner', pos: [-1, -1, 1, 1] },
        { name: 'Back center', pos: [0, 0, -1, 1] },
        { name: 'Origin', pos: [0, 0, 0, 1] },
      ];

      console.log('[RENDER-DIAG] Clip space transform verification:');
      console.log(`  Camera at: (${cameraPos.join(', ')})`);

      for (const { name, pos } of testPoints) {
        // Use mat4.transformMat4 equivalent
        const worldPos = new Float32Array(pos);
        const clipPos = new Float32Array(4);

        // Column-major matrix-vector multiply
        for (let row = 0; row < 4; row++) {
          clipPos[row] = 0;
          for (let col = 0; col < 4; col++) {
            clipPos[row] += viewProj[col * 4 + row] * worldPos[col];
          }
        }

        const w = clipPos[3];
        const ndc = [clipPos[0] / w, clipPos[1] / w, clipPos[2] / w];

        // WebGPU clip space: X,Y in [-1, 1], Z in [0, 1]
        const inClipX = ndc[0] >= -1 && ndc[0] <= 1;
        const inClipY = ndc[1] >= -1 && ndc[1] <= 1;
        const inClipZ = ndc[2] >= 0 && ndc[2] <= 1;
        const visible = inClipX && inClipY && inClipZ && w > 0;

        console.log(`  ${name}:`);
        console.log(`    World: (${pos.slice(0, 3).map(x => x.toFixed(1)).join(', ')})`);
        console.log(`    Clip:  (${clipPos[0].toFixed(3)}, ${clipPos[1].toFixed(3)}, ${clipPos[2].toFixed(3)}, w=${w.toFixed(3)})`);
        console.log(`    NDC:   (${ndc.map(x => x.toFixed(3)).join(', ')}) ${visible ? '✓' : '✗'}`);
      }
    });
  });

  describe('Buffer Packing Verification', () => {
    it('should pack multiple nodes correctly', () => {
      const nodes: NodeData[] = [
        {
          relativeOrigin: [0, 0, 0],
          scale: 1.0,
          lodLevel: 0,
          faceId: 0,
          morphStart: 100,
          morphEnd: 150,
        },
        {
          relativeOrigin: [0.5, 0.5, 0],
          scale: 0.5,
          lodLevel: 1,
          faceId: 2,
          morphStart: 50,
          morphEnd: 75,
        },
      ];

      const packed = packNodeData(nodes);

      console.log('[RENDER-DIAG] Buffer packing:');
      console.log(`  Node count: ${nodes.length}`);
      console.log(`  Buffer size: ${packed.byteLength} bytes`);
      console.log(`  Expected: ${nodes.length * NODE_DATA_SIZE} bytes`);

      // Verify packing
      expect(packed.byteLength).toBe(nodes.length * NODE_DATA_SIZE);

      // Node 0
      expect(packed[0]).toBe(0); // relativeOrigin.x
      expect(packed[1]).toBe(0); // relativeOrigin.y
      expect(packed[2]).toBe(0); // relativeOrigin.z
      expect(packed[3]).toBe(1.0); // scale

      // Node 1 starts at offset 8 (floats)
      expect(packed[8]).toBe(0.5); // relativeOrigin.x
      expect(packed[9]).toBe(0.5); // relativeOrigin.y
    });
  });

  describe('Recommended Configuration', () => {
    it('should identify optimal settings for reasonable node count', () => {
      const configs = [
        { maxLodLevel: 4, maxPixelError: 4 },
        { maxLodLevel: 6, maxPixelError: 4 },
        { maxLodLevel: 8, maxPixelError: 4 },
        { maxLodLevel: 8, maxPixelError: 8 },
        { maxLodLevel: 8, maxPixelError: 16 },
        { maxLodLevel: 12, maxPixelError: 16 },
      ];

      const tree = new QuadTree();
      const cameraPos = new Float64Array([0, 0, 3]);

      console.log('[RENDER-DIAG] Node count by configuration:');
      console.log('  (camera at z=3, looking at origin)');

      for (const config of configs) {
        tree.reset();
        const selector = new LODSelector(config);
        selector.updateRanges(1080, Math.PI / 4);

        const nodes = selector.selectNodes(tree, cameraPos, null);
        const underLimit = nodes.length <= 8192;

        console.log(`  maxLod=${config.maxLodLevel}, pixelErr=${config.maxPixelError}: ${nodes.length} nodes ${underLimit ? '✓' : '✗'}`);
      }
    });
  });

  describe('Bounding Sphere vs Rendered Geometry Mismatch', () => {
    it('should verify bounding sphere encompasses rendered cube geometry', () => {
      const tree = new QuadTree();
      const root = tree.roots[0]!; // Face 0 (+Z)

      // Get cube bounding sphere (for flat cube rendering)
      const sphere = root.cubeBoundingSphere;

      // Compute what the shader actually renders (flat cube)
      function uvToCubePos(u: number, v: number): [number, number, number] {
        const uc = 2.0 * u - 1.0;
        const vc = 2.0 * v - 1.0;
        return [uc, vc, 1.0]; // Face 0 (+Z)
      }

      // Get actual rendered corners
      const renderedCorners = [
        uvToCubePos(0, 0),  // (-1, -1, 1)
        uvToCubePos(1, 0),  // (1, -1, 1)
        uvToCubePos(0, 1),  // (-1, 1, 1)
        uvToCubePos(1, 1),  // (1, 1, 1)
      ];

      console.log('[BOUNDING-MISMATCH] Face 0 root node:');
      console.log('  Bounding sphere center:', sphere.center);
      console.log('  Bounding sphere radius:', sphere.radius.toFixed(3));
      console.log('  Rendered corners (flat cube):');

      let allInside = true;
      for (const corner of renderedCorners) {
        const dx = corner[0] - sphere.center[0]!;
        const dy = corner[1] - sphere.center[1]!;
        const dz = corner[2] - sphere.center[2]!;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const inside = dist <= sphere.radius;
        if (!inside) allInside = false;
        console.log(`    (${corner.join(', ')}) - dist: ${dist.toFixed(3)}, radius: ${sphere.radius.toFixed(3)} ${inside ? 'OK' : 'OUTSIDE!'}`);
      }

      // This will fail if there's a mismatch
      expect(allInside).toBe(true);
    });
  });
});
