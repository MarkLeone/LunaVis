/**
 * Primitive geometry generators.
 * Creates standard shapes with positions, normals, and indices.
 */

import { Geometry } from './Geometry';

/**
 * Create a simple triangle in the XY plane.
 * Vertices at top center, bottom-left, bottom-right.
 * Normal pointing towards +Z.
 */
export function createTriangle(): Geometry {
  // Positions: 3 vertices, each with x, y, z
  const positions = new Float32Array([
     0.0,  0.5, 0.0,  // Top center
    -0.5, -0.5, 0.0,  // Bottom left
     0.5, -0.5, 0.0,  // Bottom right
  ]);

  // Normals: all pointing towards viewer (+Z)
  const normals = new Float32Array([
    0.0, 0.0, 1.0,
    0.0, 0.0, 1.0,
    0.0, 0.0, 1.0,
  ]);

  // Indices: one triangle, counter-clockwise winding
  const indices = new Uint16Array([0, 1, 2]);

  return new Geometry({ positions, normals, indices });
}

/**
 * Create a unit cube centered at origin.
 * Each face has its own vertices for correct normals.
 */
export function createCube(): Geometry {
  // 6 faces × 4 vertices = 24 vertices
  // prettier-ignore
  const positions = new Float32Array([
    // Front face (+Z)
    -0.5, -0.5,  0.5,
     0.5, -0.5,  0.5,
     0.5,  0.5,  0.5,
    -0.5,  0.5,  0.5,
    // Back face (-Z)
     0.5, -0.5, -0.5,
    -0.5, -0.5, -0.5,
    -0.5,  0.5, -0.5,
     0.5,  0.5, -0.5,
    // Top face (+Y)
    -0.5,  0.5,  0.5,
     0.5,  0.5,  0.5,
     0.5,  0.5, -0.5,
    -0.5,  0.5, -0.5,
    // Bottom face (-Y)
    -0.5, -0.5, -0.5,
     0.5, -0.5, -0.5,
     0.5, -0.5,  0.5,
    -0.5, -0.5,  0.5,
    // Right face (+X)
     0.5, -0.5,  0.5,
     0.5, -0.5, -0.5,
     0.5,  0.5, -0.5,
     0.5,  0.5,  0.5,
    // Left face (-X)
    -0.5, -0.5, -0.5,
    -0.5, -0.5,  0.5,
    -0.5,  0.5,  0.5,
    -0.5,  0.5, -0.5,
  ]);

  // prettier-ignore
  const normals = new Float32Array([
    // Front face
    0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
    // Back face
    0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
    // Top face
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
    // Bottom face
    0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
    // Right face
    1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
    // Left face
    -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
  ]);

  // 6 faces × 2 triangles = 12 triangles × 3 indices = 36 indices
  // prettier-ignore
  const indices = new Uint16Array([
    0,  1,  2,   0,  2,  3,   // Front
    4,  5,  6,   4,  6,  7,   // Back
    8,  9, 10,   8, 10, 11,   // Top
   12, 13, 14,  12, 14, 15,   // Bottom
   16, 17, 18,  16, 18, 19,   // Right
   20, 21, 22,  20, 22, 23,   // Left
  ]);

  return new Geometry({ positions, normals, indices });
}
