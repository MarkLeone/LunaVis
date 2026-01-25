/**
 * DebugRenderer: Visual debugging for CDLOD terrain quadtree.
 *
 * Renders terrain patches as wireframe quads on a unit sphere,
 * with colors indicating LOD level (red → violet gradient).
 *
 * This is a standalone debug tool that doesn't depend on the
 * full terrain rendering pipeline (M11+).
 */

import { QuadTree } from './QuadTree';
import { QuadNode } from './QuadNode';
import { LODSelector, type LODSelectionStats } from './LODSelector';
import { Frustum } from './Frustum';
import { createDebugGridMesh, type DebugGridMeshData } from './DebugGridMesh';
import type { FaceId } from '@/types';
import debugWireframeShader from '@/shaders/debug-wireframe.wgsl?raw';
import debugBoundsShader from '@/shaders/debug-bounds.wgsl?raw';

/**
 * Debug node data for GPU upload.
 *
 * Layout (32 bytes):
 * - uvOrigin: vec2<f32> (8 bytes)
 * - _pad0: f32 (4 bytes)
 * - scale: f32 (4 bytes)
 * - lodLevel: u32 (4 bytes)
 * - faceId: u32 (4 bytes)
 * - radius: f32 (4 bytes)
 * - _pad1: f32 (4 bytes)
 */
interface DebugNodeData {
  uvOrigin: readonly [number, number];
  scale: number;
  lodLevel: number;
  faceId: FaceId;
  radius: number;
}

/** Size of DebugNodeData in bytes (must be multiple of 16 for alignment) */
const DEBUG_NODE_DATA_SIZE = 32;
const DEBUG_NODE_DATA_FLOATS = 8;

/**
 * Debug configuration for the terrain renderer.
 */
export interface TerrainDebugConfig {
  /** Freeze LOD selection (stop updates) */
  freezeLOD: boolean;
  /** Force all nodes to maximum detail */
  forceMaxLOD: boolean;
  /** Show wireframe (always true for debug) */
  wireframeMode: boolean;
  /** Show bounding spheres */
  showNodeBounds: boolean;
  /** Maximum pixel error for LOD selection */
  maxPixelError: number;
  /** Maximum LOD level allowed */
  maxLodLevel: number;
}

/**
 * Statistics from debug rendering.
 */
export interface DebugRenderStats extends LODSelectionStats {
  /** Time spent in LOD selection (ms) */
  selectionTimeMs: number;
  /** Time spent in GPU upload (ms) */
  uploadTimeMs: number;
}

const DEFAULT_DEBUG_CONFIG: TerrainDebugConfig = {
  freezeLOD: false,
  forceMaxLOD: false,
  wireframeMode: true,
  showNodeBounds: false,
  maxPixelError: 4.0,
  maxLodLevel: 12,
};

/**
 * Debug renderer for CDLOD terrain visualization.
 */
export class DebugRenderer {
  private readonly _quadTree: QuadTree;
  private readonly _lodSelector: LODSelector;
  private _config: TerrainDebugConfig;

  // GPU resources
  private _device: GPUDevice | null = null;
  private _gridMesh: DebugGridMeshData | null = null;
  private _vertexBuffer: GPUBuffer | null = null;
  private _indexBuffer: GPUBuffer | null = null;
  private _nodeBuffer: GPUBuffer | null = null;
  private _configBuffer: GPUBuffer | null = null;
  private _pipeline: GPURenderPipeline | null = null;
  private _boundsPipeline: GPURenderPipeline | null = null;
  private _bindGroup: GPUBindGroup | null = null;
  private _bindGroupLayout: GPUBindGroupLayout | null = null;
  private _boundsVertexBuffer: GPUBuffer | null = null;
  private _boundsIndexBuffer: GPUBuffer | null = null;
  private _boundsMesh: DebugSphereMeshData | null = null;

  // State
  private _selectedNodes: DebugNodeData[] = [];
  private _lastStats: DebugRenderStats | null = null;
  private _nodeBufferCapacity = 0;
  private _warnedMaxNodes = false;

  /** Grid resolution for debug patches */
  static readonly GRID_RESOLUTION = 8;
  /** Maximum nodes to render */
  static readonly MAX_NODES = 4096;

  constructor(config: Partial<TerrainDebugConfig> = {}) {
    this._config = { ...DEFAULT_DEBUG_CONFIG, ...config };
    this._quadTree = new QuadTree();
    this._lodSelector = new LODSelector({
      maxPixelError: this._config.maxPixelError,
      maxLodLevel: this._config.maxLodLevel,
    });
  }

  // --- Accessors ---

  get config(): Readonly<TerrainDebugConfig> {
    return this._config;
  }

  get quadTree(): QuadTree {
    return this._quadTree;
  }

  get lodSelector(): LODSelector {
    return this._lodSelector;
  }

  get lastStats(): DebugRenderStats | null {
    return this._lastStats;
  }

  get selectedNodeCount(): number {
    return this._selectedNodes.length;
  }

  get isInitialized(): boolean {
    return this._device !== null;
  }

  // --- Configuration ---

  setConfig(config: Partial<TerrainDebugConfig>): void {
    this._config = { ...this._config, ...config };

    // Update LOD selector if relevant config changed
    if (config.maxPixelError !== undefined || config.maxLodLevel !== undefined) {
      this._lodSelector.setConfig({
        maxPixelError: this._config.maxPixelError,
        maxLodLevel: this._config.maxLodLevel,
      });
    }
  }

  // --- Initialization ---

  /**
   * Initialize GPU resources.
   *
   * @param device - GPU device
   * @param format - Canvas texture format
   * @param globalBindGroupLayout - Layout for global uniforms (group 0)
   */
  init(
    device: GPUDevice,
    format: GPUTextureFormat,
    globalBindGroupLayout: GPUBindGroupLayout
  ): void {
    if (this._device) {
      throw new Error('DebugRenderer already initialized');
    }
    this._device = device;

    // Create grid mesh
    this._gridMesh = createDebugGridMesh(DebugRenderer.GRID_RESOLUTION);

    // Create vertex buffer (grid positions)
    this._vertexBuffer = device.createBuffer({
      label: 'debug-grid-vertices',
      size: this._gridMesh.positions.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this._vertexBuffer, 0, this._gridMesh.positions);

    // Create index buffer (line indices)
    this._indexBuffer = device.createBuffer({
      label: 'debug-grid-indices',
      size: this._gridMesh.lineIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this._indexBuffer, 0, this._gridMesh.lineIndices);

    // Create node data storage buffer (resizable)
    this._nodeBufferCapacity = 256;
    this._nodeBuffer = this.createNodeBuffer(this._nodeBufferCapacity);

    // Create debug config uniform buffer
    this._configBuffer = device.createBuffer({
      label: 'debug-config',
      size: 16, // 4 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create bind group layout for debug data (group 1)
    this._bindGroupLayout = device.createBindGroupLayout({
      label: 'debug-bindGroupLayout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' },
        },
      ],
    });

    // Create bind group
    this._bindGroup = this.createBindGroup();

    // Create render pipeline for patch wireframe
    const shaderModule = device.createShaderModule({
      label: 'debug-wireframe-shader',
      code: debugWireframeShader,
    });

    const pipelineLayout = device.createPipelineLayout({
      label: 'debug-pipeline-layout',
      bindGroupLayouts: [globalBindGroupLayout, this._bindGroupLayout],
    });

    this._pipeline = device.createRenderPipeline({
      label: 'debug-wireframe-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            // Grid vertex positions (vec2<f32>)
            arrayStride: 8,
            stepMode: 'vertex',
            attributes: [
              { format: 'float32x2', offset: 0, shaderLocation: 0 },
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format }],
      },
      primitive: {
        topology: 'line-list',
        cullMode: 'none',
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });

    // Create bounds mesh + pipeline
    this._boundsMesh = createDebugSphereMesh(24);
    this._boundsVertexBuffer = device.createBuffer({
      label: 'debug-bounds-vertices',
      size: this._boundsMesh.positions.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this._boundsVertexBuffer, 0, this._boundsMesh.positions);

    this._boundsIndexBuffer = device.createBuffer({
      label: 'debug-bounds-indices',
      size: this._boundsMesh.lineIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this._boundsIndexBuffer, 0, this._boundsMesh.lineIndices);

    const boundsShaderModule = device.createShaderModule({
      label: 'debug-bounds-shader',
      code: debugBoundsShader,
    });

    this._boundsPipeline = device.createRenderPipeline({
      label: 'debug-bounds-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: boundsShaderModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            // Sphere wireframe positions (vec3<f32>)
            arrayStride: 12,
            stepMode: 'vertex',
            attributes: [
              { format: 'float32x3', offset: 0, shaderLocation: 0 },
            ],
          },
        ],
      },
      fragment: {
        module: boundsShaderModule,
        entryPoint: 'fs_main',
        targets: [{ format }],
      },
      primitive: {
        topology: 'line-list',
        cullMode: 'none',
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });
  }

  /**
   * Create a node data storage buffer.
   */
  private createNodeBuffer(capacity: number): GPUBuffer {
    return this._device!.createBuffer({
      label: 'debug-node-data',
      size: capacity * DEBUG_NODE_DATA_SIZE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  /**
   * Create bind group for current buffers.
   */
  private createBindGroup(): GPUBindGroup {
    return this._device!.createBindGroup({
      label: 'debug-bindGroup',
      layout: this._bindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: this._nodeBuffer! } },
        { binding: 1, resource: { buffer: this._configBuffer! } },
      ],
    });
  }

  // --- LOD Selection ---

  /**
   * Select visible nodes based on camera position and frustum.
   *
   * @param cameraPos - Camera position (for unit sphere, typically [0, 0, 3])
   * @param viewProjectionMatrix - View-projection matrix for frustum extraction
   * @param screenHeight - Screen height for LOD calculation
   * @param fov - Field of view in radians
   */
  selectNodes(
    cameraPos: Float64Array,
    viewProjectionMatrix: Float32Array | Float64Array,
    screenHeight: number,
    fov: number
  ): void {
    if (this._config.freezeLOD) {
      return; // Keep previous selection
    }

    const startTime = performance.now();

    // Update LOD ranges if screen/FOV changed
    this._lodSelector.updateRanges(screenHeight, fov);

    // Extract frustum from view-projection matrix
    const frustum = Frustum.fromViewProjection(viewProjectionMatrix);

    // Reset tree if forceMaxLOD changed (to rebuild at correct level)
    // Note: This is a simplification; proper implementation would track state

    // Select nodes
    if (this._config.forceMaxLOD) {
      // Force all nodes to max detail - expand tree fully
      this._selectedNodes = this.selectAllAtMaxLOD(cameraPos, frustum);
    } else {
      // Normal LOD selection
      this._selectedNodes = this.selectNodesRecursive(cameraPos, frustum);
    }

    const selectionTime = performance.now() - startTime;

    // Update stats
    this._lastStats = {
      ...this._lodSelector.stats,
      selectionTimeMs: selectionTime,
      uploadTimeMs: 0,
    };

    // Log LOD distribution
    this.logLODDistribution();
  }

  /**
   * Select nodes using LOD criteria (normal mode).
   */
  private selectNodesRecursive(
    cameraPos: Float64Array,
    frustum: Frustum
  ): DebugNodeData[] {
    const results: DebugNodeData[] = [];

    for (const root of this._quadTree.roots) {
      this.selectNodeRecursive(root, cameraPos, frustum, results);
    }

    return results;
  }

  /**
   * Recursive node selection with LOD and frustum culling.
   */
  private selectNodeRecursive(
    node: QuadNode,
    cameraPos: Float64Array,
    frustum: Frustum,
    results: DebugNodeData[]
  ): void {
    // Frustum culling
    const sphere = node.boundingSphere;
    if (!frustum.intersectsSphere(sphere.center, sphere.radius)) {
      return;
    }

    // Distance calculation
    const center = node.sphereCenter;
    const dx = center[0]! - cameraPos[0]!;
    const dy = center[1]! - cameraPos[1]!;
    const dz = center[2]! - cameraPos[2]!;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // LOD decision
    const range = this._lodSelector.ranges[node.lodLevel];
    const shouldSubdivide =
      range &&
      dist < range.distance &&
      node.lodLevel < this._config.maxLodLevel;

    if (shouldSubdivide) {
      // Need more detail
      if (node.isLeaf) {
        node.subdivide();
      }
      for (const child of node.children!) {
        this.selectNodeRecursive(child, cameraPos, frustum, results);
      }
    } else {
      // This node is detailed enough
      if (node.isSubdivided) {
        node.collapse();
      }
      results.push(this.nodeToDebugData(node));
    }
  }

  /**
   * Select all nodes at maximum LOD level (forceMaxLOD mode).
   */
  private selectAllAtMaxLOD(
    cameraPos: Float64Array,
    frustum: Frustum
  ): DebugNodeData[] {
    const results: DebugNodeData[] = [];

    for (const root of this._quadTree.roots) {
      this.expandToMaxLOD(root, cameraPos, frustum, results);
    }

    return results;
  }

  /**
   * Expand node to max LOD, collecting only visible leaves.
   */
  private expandToMaxLOD(
    node: QuadNode,
    cameraPos: Float64Array,
    frustum: Frustum,
    results: DebugNodeData[]
  ): void {
    // Frustum culling
    const sphere = node.boundingSphere;
    if (!frustum.intersectsSphere(sphere.center, sphere.radius)) {
      return;
    }

    if (node.lodLevel < this._config.maxLodLevel) {
      // Not at max level, subdivide
      if (node.isLeaf) {
        node.subdivide();
      }
      for (const child of node.children!) {
        this.expandToMaxLOD(child, cameraPos, frustum, results);
      }
    } else {
      // At max level, add to results
      const center = node.sphereCenter;
      const dx = center[0]! - cameraPos[0]!;
      const dy = center[1]! - cameraPos[1]!;
      const dz = center[2]! - cameraPos[2]!;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      results.push(this.nodeToDebugData(node));
    }
  }

  /**
   * Convert QuadNode to debug data for GPU upload.
   */
  private nodeToDebugData(node: QuadNode): DebugNodeData {
    return {
      uvOrigin: node.origin,
      scale: node.size,
      lodLevel: node.lodLevel,
      faceId: node.faceId,
      radius: node.boundingSphere.radius,
    };
  }

  /**
   * Log LOD level distribution to console.
   */
  private logLODDistribution(): void {
    const levelCounts: number[] = [];
    for (const node of this._selectedNodes) {
      while (levelCounts.length <= node.lodLevel) {
        levelCounts.push(0);
      }
      levelCounts[node.lodLevel]!++;
    }

    const histogram = levelCounts
      .map((count, level) => `L${level}:${count}`)
      .join(' ');

    console.debug(
      `[DebugRenderer] ${this._selectedNodes.length} nodes | ${histogram}`
    );
  }

  // --- Rendering ---

  /**
   * Render the debug terrain visualization.
   *
   * @param renderPass - Active render pass encoder
   * @param globalBindGroup - Global uniforms bind group (group 0)
   */
  render(renderPass: GPURenderPassEncoder, globalBindGroup: GPUBindGroup): void {
    if (
      !this._device ||
      !this._pipeline ||
      this._selectedNodes.length === 0 ||
      (!this._config.wireframeMode && !this._config.showNodeBounds)
    ) {
      return;
    }

    const startTime = performance.now();

    const renderNodeCount = Math.min(
      this._selectedNodes.length,
      DebugRenderer.MAX_NODES
    );

    if (this._selectedNodes.length > DebugRenderer.MAX_NODES && !this._warnedMaxNodes) {
      console.warn(
        `[DebugRenderer] Node count capped at ${DebugRenderer.MAX_NODES} (requested ${this._selectedNodes.length})`
      );
      this._warnedMaxNodes = true;
    }

    // Resize node buffer if needed
    if (renderNodeCount > this._nodeBufferCapacity) {
      this._nodeBuffer?.destroy();
      this._nodeBufferCapacity = Math.min(
        Math.max(this._nodeBufferCapacity * 2, renderNodeCount),
        DebugRenderer.MAX_NODES
      );
      this._nodeBuffer = this.createNodeBuffer(this._nodeBufferCapacity);
      this._bindGroup = this.createBindGroup();
    }

    // Pack node data
    const nodeData = this.packNodeData(this._selectedNodes, renderNodeCount);
    this._device.queue.writeBuffer(this._nodeBuffer!, 0, nodeData);

    // Update config buffer
    const configData = new ArrayBuffer(16);
    const configU32 = new Uint32Array(configData);
    const configF32 = new Float32Array(configData);
    configU32[0] = this._config.maxLodLevel;
    configF32[1] = 1.0; // sphereRadius (unit sphere)
    configF32[2] = 1.0; // lineWidth (unused)
    configF32[3] = 0.0;
    this._device.queue.writeBuffer(this._configBuffer!, 0, configData);

    const uploadTime = performance.now() - startTime;
    if (this._lastStats) {
      this._lastStats.uploadTimeMs = uploadTime;
    }

    // Draw wireframe patches
    if (this._config.wireframeMode) {
      renderPass.setPipeline(this._pipeline);
      renderPass.setBindGroup(0, globalBindGroup);
      renderPass.setBindGroup(1, this._bindGroup!);
      renderPass.setVertexBuffer(0, this._vertexBuffer!);
      renderPass.setIndexBuffer(this._indexBuffer!, 'uint16');
      renderPass.drawIndexed(
        this._gridMesh!.lineIndices.length,
        renderNodeCount,
        0,
        0,
        0
      );
    }

    // Draw bounding spheres
    if (this._config.showNodeBounds && this._boundsPipeline) {
      renderPass.setPipeline(this._boundsPipeline);
      renderPass.setBindGroup(0, globalBindGroup);
      renderPass.setBindGroup(1, this._bindGroup!);
      renderPass.setVertexBuffer(0, this._boundsVertexBuffer!);
      renderPass.setIndexBuffer(this._boundsIndexBuffer!, 'uint16');
      renderPass.drawIndexed(
        this._boundsMesh!.lineIndices.length,
        renderNodeCount,
        0,
        0,
        0
      );
    }
  }

  /**
   * Pack debug node data into a Float32Array for GPU upload.
   */
  private packNodeData(nodes: DebugNodeData[], count: number): Float32Array {
    const buffer = new Float32Array(count * DEBUG_NODE_DATA_FLOATS);

    for (let i = 0; i < count; i++) {
      const node = nodes[i]!;
      const offset = i * DEBUG_NODE_DATA_FLOATS;

      // uvOrigin: vec2<f32> + pad
      buffer[offset + 0] = node.uvOrigin[0];
      buffer[offset + 1] = node.uvOrigin[1];
      buffer[offset + 2] = 0; // padding for vec3 alignment in shader

      // scale: f32
      buffer[offset + 3] = node.scale;

      // lodLevel: u32 (as float)
      buffer[offset + 4] = node.lodLevel;

      // faceId: u32 (as float)
      buffer[offset + 5] = node.faceId;

      // radius: f32
      buffer[offset + 6] = node.radius;

      // padding
      buffer[offset + 7] = 0;
    }

    return buffer;
  }

  // --- Cleanup ---

  /**
   * Clean up GPU resources.
   */
  dispose(): void {
    this._vertexBuffer?.destroy();
    this._indexBuffer?.destroy();
    this._nodeBuffer?.destroy();
    this._configBuffer?.destroy();
    this._boundsVertexBuffer?.destroy();
    this._boundsIndexBuffer?.destroy();
    this._device = null;
  }
}

interface DebugSphereMeshData {
  positions: Float32Array;
  lineIndices: Uint16Array;
}

function createDebugSphereMesh(segments: number): DebugSphereMeshData {
  const clampedSegments = Math.max(6, Math.min(segments, 128));
  const circles = 3;
  const vertexCount = clampedSegments * circles;
  const positions = new Float32Array(vertexCount * 3);
  const lineIndices = new Uint16Array(clampedSegments * circles * 2);

  let v = 0;
  let i = 0;

  for (let circle = 0; circle < circles; circle++) {
    const baseIndex = circle * clampedSegments;
    for (let s = 0; s < clampedSegments; s++) {
      const t = (s / clampedSegments) * Math.PI * 2;
      const x = Math.cos(t);
      const y = Math.sin(t);

      if (circle === 0) {
        positions[v++] = x;
        positions[v++] = y;
        positions[v++] = 0;
      } else if (circle === 1) {
        positions[v++] = x;
        positions[v++] = 0;
        positions[v++] = y;
      } else {
        positions[v++] = 0;
        positions[v++] = x;
        positions[v++] = y;
      }

      const next = (s + 1) % clampedSegments;
      lineIndices[i++] = baseIndex + s;
      lineIndices[i++] = baseIndex + next;
    }
  }

  return { positions, lineIndices };
}
