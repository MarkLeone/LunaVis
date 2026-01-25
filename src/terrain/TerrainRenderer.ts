/**
 * TerrainRenderer: Instanced rendering for CDLOD terrain patches (M11).
 *
 * Renders flat cube-face patches using a static grid mesh and a NodeData storage buffer.
 * Uses LOD-based debug coloring for verification.
 */

import { QuadTree } from './QuadTree';
import type { QuadNode } from './QuadNode';
import { LODSelector } from './LODSelector';
import { Frustum } from './Frustum';
import { createGridMesh, type GridMeshData } from './GridMesh';
import {
  NODE_DATA_FLOATS,
  NODE_DATA_SIZE,
  type NodeData,
} from './NodeData';
import type { TerrainDebugConfig, DebugRenderStats } from './DebugRenderer';
import terrainFlatShader from '@/shaders/terrain-flat.wgsl?raw';
import type { RenderMode } from '@/core/RenderSource';

const DEFAULT_CONFIG: TerrainDebugConfig = {
  freezeLOD: false,
  forceMaxLOD: false,
  wireframeMode: false,
  showNodeBounds: false,
  disableCulling: false,
  maxPixelError: 4.0,
  maxLodLevel: 12,
};

export class TerrainRenderer {
  private readonly quadTree = new QuadTree();
  private readonly lodSelector = new LODSelector();
  private configState: TerrainDebugConfig;
  private mode: RenderMode = 'solid';

  private device: GPUDevice | null = null;
  private gridMesh: GridMeshData | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private triangleIndexBuffer: GPUBuffer | null = null;
  private lineIndexBuffer: GPUBuffer | null = null;
  private nodeBuffer: GPUBuffer | null = null;
  private configBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private bindGroupLayout: GPUBindGroupLayout | null = null;
  private solidPipeline: GPURenderPipeline | null = null;
  private wireframePipeline: GPURenderPipeline | null = null;

  private selectedNodes: NodeData[] = [];
  private lastSelectionStats: DebugRenderStats | null = null;
  private nodeBufferCapacity = 0;
  private cpuNodeBuffer: Float32Array | null = null;

  static readonly GRID_RESOLUTION = 32;
  static readonly MAX_NODES = 8192;

  constructor(config: Partial<TerrainDebugConfig> = {}) {
    this.configState = { ...DEFAULT_CONFIG, ...config };
  }

  get config(): Readonly<TerrainDebugConfig> {
    return this.configState;
  }

  get lastStats(): DebugRenderStats | null {
    return this.lastSelectionStats;
  }

  setConfig(config: Partial<TerrainDebugConfig>): void {
    this.configState = { ...this.configState, ...config };
  }

  setRenderMode(mode: RenderMode): void {
    this.mode = mode;
  }

  init(device: GPUDevice, format: GPUTextureFormat, globalBindGroupLayout: GPUBindGroupLayout): void {
    if (this.device) {
      throw new Error('TerrainRenderer already initialized');
    }

    this.device = device;
    this.gridMesh = createGridMesh(TerrainRenderer.GRID_RESOLUTION);

    this.vertexBuffer = device.createBuffer({
      label: 'terrain-grid-vertices',
      size: this.gridMesh.positions.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.vertexBuffer, 0, this.gridMesh.positions);

    this.triangleIndexBuffer = device.createBuffer({
      label: 'terrain-grid-triangle-indices',
      size: this.gridMesh.triangleIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.triangleIndexBuffer, 0, this.gridMesh.triangleIndices);

    this.lineIndexBuffer = device.createBuffer({
      label: 'terrain-grid-line-indices',
      size: this.gridMesh.lineIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.lineIndexBuffer, 0, this.gridMesh.lineIndices);

    this.configBuffer = device.createBuffer({
      label: 'terrain-config',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'terrain-bindGroupLayout',
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

    this.nodeBufferCapacity = 256;
    this.nodeBuffer = this.createNodeBuffer(this.nodeBufferCapacity);
    this.bindGroup = this.createBindGroup();

    const shaderModule = device.createShaderModule({
      label: 'terrain-flat-shader',
      code: terrainFlatShader,
    });

    const pipelineLayout = device.createPipelineLayout({
      label: 'terrain-pipeline-layout',
      bindGroupLayouts: [globalBindGroupLayout, this.bindGroupLayout],
    });

    this.solidPipeline = device.createRenderPipeline({
      label: 'terrain-solid-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [
          {
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
        topology: 'triangle-list',
        cullMode: 'none',
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });

    this.wireframePipeline = device.createRenderPipeline({
      label: 'terrain-wireframe-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [
          {
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
  }

  selectNodes(
    cameraPos: Float64Array,
    viewProjectionMatrix: Float32Array | Float64Array,
    screenHeight: number,
    fov: number
  ): void {
    if (this.configState.freezeLOD) {
      return;
    }

    const startTime = performance.now();

    this.lodSelector.setConfig({
      maxPixelError: this.configState.maxPixelError,
      maxLodLevel: this.configState.maxLodLevel,
    });
    this.lodSelector.updateRanges(screenHeight, fov);

    const frustum = this.configState.disableCulling
      ? null
      : Frustum.fromViewProjection(viewProjectionMatrix);

    if (this.configState.forceMaxLOD) {
      const stats = this.createEmptyStats();
      this.selectedNodes = this.selectAllAtMaxLOD(frustum, stats);
      this.lastSelectionStats = {
        ...stats,
        selectionTimeMs: performance.now() - startTime,
        uploadTimeMs: 0,
      };
      return;
    }

    this.selectedNodes = this.lodSelector.selectNodes(
      this.quadTree,
      cameraPos,
      frustum
    );

    if (this.selectedNodes.length === 0 && frustum) {
      this.selectedNodes = this.lodSelector.selectNodes(
        this.quadTree,
        cameraPos,
        null
      );
    }

    this.lastSelectionStats = {
      ...this.lodSelector.stats,
      selectionTimeMs: performance.now() - startTime,
      uploadTimeMs: 0,
    };
  }

  render(renderPass: GPURenderPassEncoder, globalBindGroup: GPUBindGroup): void {
    if (
      !this.device ||
      !this.gridMesh ||
      !this.vertexBuffer ||
      !this.triangleIndexBuffer ||
      !this.lineIndexBuffer ||
      !this.bindGroup ||
      !this.solidPipeline ||
      !this.wireframePipeline ||
      this.selectedNodes.length === 0
    ) {
      return;
    }

    const startTime = performance.now();
    const renderNodeCount = Math.min(
      this.selectedNodes.length,
      TerrainRenderer.MAX_NODES
    );

    if (renderNodeCount > this.nodeBufferCapacity) {
      this.nodeBuffer?.destroy();
      this.nodeBufferCapacity = Math.min(
        Math.max(this.nodeBufferCapacity * 2, renderNodeCount),
        TerrainRenderer.MAX_NODES
      );
      this.nodeBuffer = this.createNodeBuffer(this.nodeBufferCapacity);
      this.bindGroup = this.createBindGroup();
    }

    if (!this.cpuNodeBuffer || this.cpuNodeBuffer.length < renderNodeCount * NODE_DATA_FLOATS) {
      this.cpuNodeBuffer = new Float32Array(renderNodeCount * NODE_DATA_FLOATS);
    }

    this.packNodeData(this.selectedNodes, renderNodeCount, this.cpuNodeBuffer);

    this.device.queue.writeBuffer(
      this.nodeBuffer!,
      0,
      this.cpuNodeBuffer,
      0,
      renderNodeCount * NODE_DATA_SIZE
    );

    const configData = new ArrayBuffer(16);
    const configU32 = new Uint32Array(configData);
    configU32[0] = this.configState.maxLodLevel >>> 0;
    this.device.queue.writeBuffer(this.configBuffer!, 0, configData);

    const uploadTime = performance.now() - startTime;
    if (this.lastSelectionStats) {
      this.lastSelectionStats.uploadTimeMs = uploadTime;
    }

    const pipeline = this.mode === 'wireframe' ? this.wireframePipeline : this.solidPipeline;
    const indexBuffer =
      this.mode === 'wireframe' ? this.lineIndexBuffer : this.triangleIndexBuffer;
    const indexCount =
      this.mode === 'wireframe'
        ? this.gridMesh.lineIndices.length
        : this.gridMesh.triangleIndices.length;

    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, globalBindGroup);
    renderPass.setBindGroup(1, this.bindGroup);
    renderPass.setVertexBuffer(0, this.vertexBuffer);
    renderPass.setIndexBuffer(indexBuffer, 'uint16');
    renderPass.drawIndexed(indexCount, renderNodeCount, 0, 0, 0);
  }

  private createNodeBuffer(capacity: number): GPUBuffer {
    if (!this.device) {
      throw new Error('TerrainRenderer not initialized');
    }

    return this.device.createBuffer({
      label: 'terrain-node-buffer',
      size: capacity * NODE_DATA_SIZE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  private createBindGroup(): GPUBindGroup {
    if (!this.device || !this.bindGroupLayout || !this.nodeBuffer || !this.configBuffer) {
      throw new Error('TerrainRenderer not initialized');
    }

    return this.device.createBindGroup({
      label: 'terrain-bindGroup',
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.nodeBuffer },
        },
        {
          binding: 1,
          resource: { buffer: this.configBuffer },
        },
      ],
    });
  }

  private selectAllAtMaxLOD(
    frustum: Frustum | null,
    stats: DebugRenderStats
  ): NodeData[] {
    const results: NodeData[] = [];

    for (const root of this.quadTree.roots) {
      this.expandToMaxLOD(root, frustum, results, stats);
    }

    stats.nodesSelected = results.length;
    if (results.length > 0) {
      stats.maxLodLevel = Math.max(...results.map((node) => node.lodLevel));
    }

    return results;
  }

  private expandToMaxLOD(
    node: QuadNode,
    frustum: Frustum | null,
    results: NodeData[],
    stats: DebugRenderStats
  ): void {
    stats.nodesVisited++;

    if (frustum) {
      const sphere = node.boundingSphere;
      if (!frustum.intersectsSphere(sphere.center, sphere.radius)) {
        stats.nodesCulled++;
        return;
      }
    }

    if (node.lodLevel < this.configState.maxLodLevel) {
      if (node.isLeaf) {
        node.subdivide();
      }
      for (const child of node.children!) {
        this.expandToMaxLOD(child, frustum, results, stats);
      }
      return;
    }

    results.push(this.nodeToData(node));

    while (stats.nodesPerLevel.length <= node.lodLevel) {
      stats.nodesPerLevel.push(0);
    }
    stats.nodesPerLevel[node.lodLevel]!++;
  }

  private nodeToData(node: QuadNode): NodeData {
    const origin = node.origin;
    const range = this.lodSelector.ranges[node.lodLevel];
    const morphStart = range?.morphStart ?? 0;
    const morphEnd = range?.distance ?? 0;

    return {
      relativeOrigin: [origin[0]!, origin[1]!, 0],
      scale: node.size,
      lodLevel: node.lodLevel,
      faceId: node.faceId,
      morphStart,
      morphEnd,
    };
  }

  private createEmptyStats(): DebugRenderStats {
    return {
      nodesVisited: 0,
      nodesCulled: 0,
      nodesSelected: 0,
      nodesPerLevel: [],
      maxLodLevel: 0,
      selectionTimeMs: 0,
      uploadTimeMs: 0,
    };
  }

  private packNodeData(
    nodes: readonly NodeData[],
    count: number,
    buffer: Float32Array
  ): void {
    const bufferU32 = new Uint32Array(buffer.buffer, buffer.byteOffset, buffer.length);
    for (let i = 0; i < count; i++) {
      const node = nodes[i]!;
      const idx = i * NODE_DATA_FLOATS;
      buffer[idx + 0] = node.relativeOrigin[0];
      buffer[idx + 1] = node.relativeOrigin[1];
      buffer[idx + 2] = node.relativeOrigin[2];
      buffer[idx + 3] = node.scale;
      bufferU32[idx + 4] = node.lodLevel >>> 0;
      bufferU32[idx + 5] = node.faceId >>> 0;
      buffer[idx + 6] = node.morphStart;
      buffer[idx + 7] = node.morphEnd;
    }
  }
}
