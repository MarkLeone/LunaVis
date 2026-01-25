/**
 * DebugGridMesh: Simple grid mesh generator for terrain debug visualization.
 *
 * Generates a flat N×N grid of vertices in UV space (0-1 range) with indices
 * for wireframe rendering using line-list topology.
 *
 * Used by DebugRenderer for instanced terrain patch visualization.
 */

/** Result of grid mesh generation */
export interface DebugGridMeshData {
  /** Vertex positions in UV space (2 floats per vertex: u, v) */
  readonly positions: Float32Array;
  /** Line indices for wireframe rendering */
  readonly lineIndices: Uint16Array;
  /** Triangle indices for filled rendering (optional) */
  readonly triangleIndices: Uint16Array;
  /** Number of vertices */
  readonly vertexCount: number;
  /** Number of line segments */
  readonly lineCount: number;
  /** Number of triangles */
  readonly triangleCount: number;
  /** Grid resolution (N×N) */
  readonly resolution: number;
}

/**
 * Generate a debug grid mesh for terrain patch visualization.
 *
 * The grid covers UV coordinates from (0,0) to (1,1).
 * Vertices are stored as 2D positions (u, v).
 *
 * @param resolution - Number of cells per side (e.g., 8 creates 9×9 vertices)
 * @returns Grid mesh data with positions and indices
 */
export function createDebugGridMesh(resolution: number = 8): DebugGridMeshData {
  if (resolution < 1 || resolution > 64) {
    throw new Error(`Invalid grid resolution: ${resolution}. Must be 1-64.`);
  }

  const verticesPerSide = resolution + 1;
  const vertexCount = verticesPerSide * verticesPerSide;

  // Generate vertex positions (2 floats per vertex: u, v)
  const positions = new Float32Array(vertexCount * 2);
  let posIdx = 0;

  for (let j = 0; j <= resolution; j++) {
    for (let i = 0; i <= resolution; i++) {
      const u = i / resolution;
      const v = j / resolution;
      positions[posIdx++] = u;
      positions[posIdx++] = v;
    }
  }

  // Generate line indices for wireframe
  // Each cell has 2 horizontal edges + 2 vertical edges, but we share edges
  // Horizontal lines: resolution * (resolution + 1)
  // Vertical lines: (resolution + 1) * resolution
  const horizontalLines = resolution * verticesPerSide;
  const verticalLines = verticesPerSide * resolution;
  const lineCount = horizontalLines + verticalLines;
  const lineIndices = new Uint16Array(lineCount * 2);
  let lineIdx = 0;

  // Horizontal lines (along U axis)
  for (let j = 0; j <= resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const idx = j * verticesPerSide + i;
      lineIndices[lineIdx++] = idx;
      lineIndices[lineIdx++] = idx + 1;
    }
  }

  // Vertical lines (along V axis)
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i <= resolution; i++) {
      const idx = j * verticesPerSide + i;
      lineIndices[lineIdx++] = idx;
      lineIndices[lineIdx++] = idx + verticesPerSide;
    }
  }

  // Generate triangle indices (2 triangles per cell, CCW winding)
  const triangleCount = resolution * resolution * 2;
  const triangleIndices = new Uint16Array(triangleCount * 3);
  let triIdx = 0;

  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      // Cell corners:
      // TL (i, j+1)    TR (i+1, j+1)
      // BL (i, j)      BR (i+1, j)
      const bl = j * verticesPerSide + i;
      const br = bl + 1;
      const tl = bl + verticesPerSide;
      const tr = tl + 1;

      // Triangle 1: BL, BR, TL (CCW)
      triangleIndices[triIdx++] = bl;
      triangleIndices[triIdx++] = br;
      triangleIndices[triIdx++] = tl;

      // Triangle 2: BR, TR, TL (CCW)
      triangleIndices[triIdx++] = br;
      triangleIndices[triIdx++] = tr;
      triangleIndices[triIdx++] = tl;
    }
  }

  return {
    positions,
    lineIndices,
    triangleIndices,
    vertexCount,
    lineCount,
    triangleCount,
    resolution,
  };
}

/**
 * Get the byte size of vertex buffer for a grid mesh.
 */
export function getGridVertexBufferSize(resolution: number): number {
  const verticesPerSide = resolution + 1;
  return verticesPerSide * verticesPerSide * 2 * 4; // 2 floats × 4 bytes
}

/**
 * Get the byte size of line index buffer for a grid mesh.
 */
export function getGridLineIndexBufferSize(resolution: number): number {
  const verticesPerSide = resolution + 1;
  const lineCount = resolution * verticesPerSide + verticesPerSide * resolution;
  return lineCount * 2 * 2; // 2 indices × 2 bytes
}
