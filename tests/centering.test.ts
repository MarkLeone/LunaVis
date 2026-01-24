/**
 * Test mesh centering via transform matrix.
 */

import { describe, it, expect } from 'vitest';
import { Geometry } from '@/geometry/Geometry';
import { Mesh } from '@/objects/Mesh';
import { SolidMaterial } from '@/materials/SolidMaterial';

describe('Mesh centering', () => {
  // Create a simple cube geometry offset from origin
  function createOffsetCube(offsetX: number, offsetY: number, offsetZ: number): Geometry {
    // Unit cube centered at (offsetX, offsetY, offsetZ)
    const positions = new Float32Array([
      // Front face
      -0.5 + offsetX, -0.5 + offsetY, 0.5 + offsetZ,
      0.5 + offsetX, -0.5 + offsetY, 0.5 + offsetZ,
      0.5 + offsetX, 0.5 + offsetY, 0.5 + offsetZ,
      -0.5 + offsetX, 0.5 + offsetY, 0.5 + offsetZ,
      // Back face
      -0.5 + offsetX, -0.5 + offsetY, -0.5 + offsetZ,
      0.5 + offsetX, -0.5 + offsetY, -0.5 + offsetZ,
      0.5 + offsetX, 0.5 + offsetY, -0.5 + offsetZ,
      -0.5 + offsetX, 0.5 + offsetY, -0.5 + offsetZ,
    ]);
    const normals = new Float32Array(positions.length).fill(0);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    return new Geometry({ positions, normals, indices });
  }

  function calculateBounds(positions: Float32Array) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]!;
      const y = positions[i + 1]!;
      const z = positions[i + 2]!;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }

    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
      center: {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        z: (minZ + maxZ) / 2,
      },
    };
  }

  it('calculates bounding box center correctly', () => {
    const geometry = createOffsetCube(5, 10, 15);
    const bounds = calculateBounds(geometry.positions);

    expect(bounds.center.x).toBeCloseTo(5);
    expect(bounds.center.y).toBeCloseTo(10);
    expect(bounds.center.z).toBeCloseTo(15);
  });

  it('setPosition updates mesh position', () => {
    const geometry = createOffsetCube(0, 0, 0);
    const material = new SolidMaterial({ color: [1, 0, 0, 1] });
    const mesh = new Mesh(geometry, material);

    mesh.setPosition(1, 2, 3);

    const pos = mesh.position;
    expect(pos[0]).toBeCloseTo(1);
    expect(pos[1]).toBeCloseTo(2);
    expect(pos[2]).toBeCloseTo(3);
  });

  it('worldMatrix includes position translation', () => {
    const geometry = createOffsetCube(0, 0, 0);
    const material = new SolidMaterial({ color: [1, 0, 0, 1] });
    const mesh = new Mesh(geometry, material);

    mesh.setPosition(1, 2, 3);

    const wm = mesh.worldMatrix;
    // Translation is in elements 12, 13, 14 of column-major 4x4 matrix
    expect(wm[12]).toBeCloseTo(1);
    expect(wm[13]).toBeCloseTo(2);
    expect(wm[14]).toBeCloseTo(3);
  });

  it('centering offset moves mesh so bounds center is at origin', () => {
    const offsetX = 5, offsetY = 10, offsetZ = 15;
    const geometry = createOffsetCube(offsetX, offsetY, offsetZ);
    const material = new SolidMaterial({ color: [1, 0, 0, 1] });
    const mesh = new Mesh(geometry, material);

    // Calculate center
    const bounds = calculateBounds(geometry.positions);

    // Apply centering offset
    mesh.setPosition(-bounds.center.x, -bounds.center.y, -bounds.center.z);

    // World matrix should have negative offset as translation
    const wm = mesh.worldMatrix;
    expect(wm[12]).toBeCloseTo(-offsetX);
    expect(wm[13]).toBeCloseTo(-offsetY);
    expect(wm[14]).toBeCloseTo(-offsetZ);
  });

  it('position persists after worldMatrix access', () => {
    const geometry = createOffsetCube(0, 0, 0);
    const material = new SolidMaterial({ color: [1, 0, 0, 1] });
    const mesh = new Mesh(geometry, material);

    mesh.setPosition(-5, -10, -15);

    // Access worldMatrix multiple times
    const wm1 = mesh.worldMatrix;
    const wm2 = mesh.worldMatrix;

    expect(wm1[12]).toBeCloseTo(-5);
    expect(wm2[12]).toBeCloseTo(-5);
    expect(mesh.position[0]).toBeCloseTo(-5);
  });

  it('position preserved when added to scene', async () => {
    // Import Scene to test hierarchy
    const { Scene } = await import('@/core/Scene');
    
    const geometry = createOffsetCube(5, 10, 15);
    const material = new SolidMaterial({ color: [1, 0, 0, 1] });
    const mesh = new Mesh(geometry, material);
    const scene = new Scene();

    // Center the mesh
    const bounds = calculateBounds(geometry.positions);
    mesh.setPosition(-bounds.center.x, -bounds.center.y, -bounds.center.z);

    // Check before adding to scene
    const wmBefore = mesh.worldMatrix;
    expect(wmBefore[12]).toBeCloseTo(-5);
    expect(wmBefore[13]).toBeCloseTo(-10);
    expect(wmBefore[14]).toBeCloseTo(-15);

    // Add to scene
    scene.add(mesh);

    // Check after adding to scene - scene is at origin, so worldMatrix should be same
    const wmAfter = mesh.worldMatrix;
    expect(wmAfter[12]).toBeCloseTo(-5);
    expect(wmAfter[13]).toBeCloseTo(-10);
    expect(wmAfter[14]).toBeCloseTo(-15);
  });
});

describe('Camera positioning for model', () => {
  function calculateBounds(positions: Float32Array) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]!;
      const y = positions[i + 1]!;
      const z = positions[i + 2]!;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }

    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
      center: {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        z: (minZ + maxZ) / 2,
      },
      size: {
        x: maxX - minX,
        y: maxY - minY,
        z: maxZ - minZ,
      },
    };
  }

  it('camera positioned correctly for model at origin', async () => {
    const { Camera } = await import('@/core/Camera');
    
    // Model is a unit cube at origin
    const positions = new Float32Array([
      -0.5, -0.5, -0.5,
       0.5,  0.5,  0.5,
    ]);
    const bounds = calculateBounds(positions);
    
    expect(bounds.center.x).toBeCloseTo(0);
    expect(bounds.center.y).toBeCloseTo(0);
    expect(bounds.center.z).toBeCloseTo(0);
    
    const maxSize = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
    expect(maxSize).toBeCloseTo(1);
    
    const dist = maxSize * 2.5;
    expect(dist).toBeCloseTo(2.5);
    
    const camera = new Camera({ fov: Math.PI / 4 });
    // Position camera along +Z axis (in front, Y-up system)
    camera.setPosition(bounds.center.x, bounds.center.y, bounds.center.z + dist);
    camera.setTarget(bounds.center.x, bounds.center.y, bounds.center.z);
    
    expect(camera.position[0]).toBeCloseTo(0);
    expect(camera.position[1]).toBeCloseTo(0);
    expect(camera.position[2]).toBeCloseTo(2.5);
  });

  it('camera positioned correctly for offset model', async () => {
    const { Camera } = await import('@/core/Camera');
    
    // Model is a cube at (10, 20, 30)
    const offsetX = 10, offsetY = 20, offsetZ = 30;
    const positions = new Float32Array([
      -0.5 + offsetX, -0.5 + offsetY, -0.5 + offsetZ,
       0.5 + offsetX,  0.5 + offsetY,  0.5 + offsetZ,
    ]);
    const bounds = calculateBounds(positions);
    
    expect(bounds.center.x).toBeCloseTo(10);
    expect(bounds.center.y).toBeCloseTo(20);
    expect(bounds.center.z).toBeCloseTo(30);
    
    const maxSize = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
    const dist = maxSize * 2.5;
    
    const camera = new Camera({ fov: Math.PI / 4 });
    // Position camera along +Z axis from model center (Y-up system)
    camera.setPosition(bounds.center.x, bounds.center.y, bounds.center.z + dist);
    camera.setTarget(bounds.center.x, bounds.center.y, bounds.center.z);
    
    expect(camera.position[0]).toBeCloseTo(10);
    expect(camera.position[1]).toBeCloseTo(20);
    expect(camera.position[2]).toBeCloseTo(30 + 2.5);  // 32.5
    
    expect(camera.target[0]).toBeCloseTo(10);
    expect(camera.target[1]).toBeCloseTo(20);
    expect(camera.target[2]).toBeCloseTo(30);
  });

  it('view matrix looks from camera to target', async () => {
    const { Camera } = await import('@/core/Camera');
    const { vec4 } = await import('wgpu-matrix');
    
    const camera = new Camera({ fov: Math.PI / 4 });
    // Camera at (0, -5, 0), looking at origin
    camera.setPosition(0, -5, 0);
    camera.setTarget(0, 0, 0);
    
    const viewMatrix = camera.viewMatrix;
    
    // Transform target (0, 0, 0, 1) through view matrix
    // Should end up at (0, 0, -5, 1) in view space (5 units in front)
    const targetWorld = vec4.create(0, 0, 0, 1);
    const targetView = vec4.transformMat4(targetWorld, viewMatrix);
    
    // Z should be negative (in front of camera)
    expect(targetView[2]).toBeLessThan(0);
    // Distance should be 5
    expect(Math.abs(targetView[2]!)).toBeCloseTo(5);
  });

  it('OrbitControls.reset syncs with camera position', async () => {
    const { Camera } = await import('@/core/Camera');
    const { OrbitControls } = await import('@/controls/OrbitControls');
    
    // Create a mock element
    const mockElement = {
      addEventListener: () => {},
      removeEventListener: () => {},
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
    } as unknown as HTMLElement;
    
    const camera = new Camera({ fov: Math.PI / 4 });
    camera.setPosition(0, 0, 5); // Initial position
    camera.setTarget(0, 0, 0);
    
    const controls = new OrbitControls(camera, mockElement);
    
    // Verify initial state
    expect(controls.distance).toBeCloseTo(5);
    
    // Programmatically move camera to look at model at (10, 20, 30)
    const modelCenter = { x: 10, y: 20, z: 30 };
    const dist = 2.5;
    camera.setPosition(modelCenter.x, modelCenter.y - dist, modelCenter.z);
    camera.setTarget(modelCenter.x, modelCenter.y, modelCenter.z);
    
    // Reset controls to match
    controls.reset([modelCenter.x, modelCenter.y, modelCenter.z]);
    
    // Verify controls synced
    expect(controls.distance).toBeCloseTo(dist);
    expect(controls.target[0]).toBeCloseTo(10);
    expect(controls.target[1]).toBeCloseTo(20);
    expect(controls.target[2]).toBeCloseTo(30);
  });
});

describe('GLTFLoader bounds', () => {
  it('calculates camera distance from bounds', () => {
    // Simulate teapot-sized model (about 3 units wide)
    const bounds = {
      min: { x: -1.5, y: -1, z: -1.5 },
      max: { x: 1.5, y: 2, z: 1.5 },
    };
    
    const center = {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2,
    };
    const size = {
      x: bounds.max.x - bounds.min.x,
      y: bounds.max.y - bounds.min.y,
      z: bounds.max.z - bounds.min.z,
    };
    
    expect(center.x).toBeCloseTo(0);
    expect(center.y).toBeCloseTo(0.5);
    expect(center.z).toBeCloseTo(0);
    
    const maxSize = Math.max(size.x, size.y, size.z);
    expect(maxSize).toBeCloseTo(3); // y dimension
    
    const cameraDist = maxSize * 2.5;
    expect(cameraDist).toBeCloseTo(7.5);
    
    // Camera position (from -Y axis)
    const camPos = {
      x: center.x,
      y: center.y - cameraDist,
      z: center.z,
    };
    
    expect(camPos.x).toBeCloseTo(0);
    expect(camPos.y).toBeCloseTo(-7); // 0.5 - 7.5
    expect(camPos.z).toBeCloseTo(0);
  });
});
