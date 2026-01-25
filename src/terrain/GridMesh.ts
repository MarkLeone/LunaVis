/**
 * GridMesh: Generates a reusable N×N grid in UV space for instanced terrain.
 *
 * The grid spans 0..1 in both U and V and uses indexed triangles for solid rendering.
 * Line indices are included for optional wireframe rendering.
 */

/** Result of grid mesh generation */
export interface GridMeshData {
  /** Vertex positions in UV space (2 floats per vertex: u, v) */
  readonly positions: Float32Array;
  /** Triangle indices for solid rendering */
  readonly triangleIndices: Uint16Array;
  /** Line indices for wireframe rendering */
  readonly lineIndices: Uint16Array;
  /** Number of vertices */
  readonly vertexCount: number;
  /** Number of triangles */
  readonly triangleCount: number;
  /** Grid resolution (N×N cells) */
  readonly resolution: number;
}

/**
 * Generate a grid mesh for terrain patch instancing.
 *
 * @param resolution - Number of cells per side (e.g., 32 creates 33×33 vertices)
 */
export function createGridMesh(resolution: number = 32): GridMeshData {
  if (resolution < 1 || resolution > 255) {
    throw new Error(`Invalid grid resolution: ${resolution}. Must be 1-255.`);
  }

  const verticesPerSide = resolution + 1;
  const vertexCount = verticesPerSide * verticesPerSide;

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

  const triangleCount = resolution * resolution * 2;
  const triangleIndices = new Uint16Array(triangleCount * 3);
  let triIdx = 0;

  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const bl = j * verticesPerSide + i;
      const br = bl + 1;
      const tl = bl + verticesPerSide;
      const tr = tl + 1;

      triangleIndices[triIdx++] = bl;
      triangleIndices[triIdx++] = br;
      triangleIndices[triIdx++] = tl;

      triangleIndices[triIdx++] = br;
      triangleIndices[triIdx++] = tr;
      triangleIndices[triIdx++] = tl;
    }
  }

  const horizontalLines = resolution * verticesPerSide;
  const verticalLines = verticesPerSide * resolution;
  const lineCount = horizontalLines + verticalLines;
  const lineIndices = new Uint16Array(lineCount * 2);
  let lineIdx = 0;

  for (let j = 0; j <= resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const idx = j * verticesPerSide + i;
      lineIndices[lineIdx++] = idx;
      lineIndices[lineIdx++] = idx + 1;
    }
  }

  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i <= resolution; i++) {
      const idx = j * verticesPerSide + i;
      lineIndices[lineIdx++] = idx;
      lineIndices[lineIdx++] = idx + verticesPerSide;
    }
  }

  return {
    positions,
    triangleIndices,
    lineIndices,
    vertexCount,
    triangleCount,
    resolution,
  };
}
