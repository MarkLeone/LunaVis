import type { RenderSource, RenderMode, FrameContext } from './RenderSource';
import type { Scene } from './Scene';
import type { Mesh } from '@/objects/Mesh';
import type { Geometry } from '@/geometry/Geometry';
import wireframeShader from '@/shaders/wireframe.wgsl?raw';

interface WireframeIndexData {
  buffer: GPUBuffer;
  count: number;
  format: GPUIndexFormat;
}

export class MeshRenderSource implements RenderSource {
  readonly name = 'Mesh';

  private readonly scene: Scene;
  private readonly device: GPUDevice;
  private readonly format: GPUTextureFormat;
  private readonly globalLayout: GPUBindGroupLayout;

  private mode: RenderMode = 'solid';
  private wireframePipeline: GPURenderPipeline | null = null;
  private wireframeBindGroup: GPUBindGroup | null = null;
  private wireframeUniformBuffer: GPUBuffer | null = null;
  private wireframeIndexCache = new Map<string, WireframeIndexData>();

  constructor(
    scene: Scene,
    device: GPUDevice,
    format: GPUTextureFormat,
    globalLayout: GPUBindGroupLayout
  ) {
    this.scene = scene;
    this.device = device;
    this.format = format;
    this.globalLayout = globalLayout;
  }

  setRenderMode(mode: RenderMode): void {
    this.mode = mode;
  }

  update(frame: FrameContext): void {
    void frame;
  }

  render(pass: GPURenderPassEncoder, frame: FrameContext): void {
    const meshes = this.scene.getMeshes();
    if (meshes.length === 0) {
      console.warn('[LunaVis] No meshes in scene');
      return;
    }

    if (this.mode === 'wireframe') {
      this.renderWireframe(pass, frame, meshes);
      return;
    }

    for (const mesh of meshes) {
      if (mesh.isReady) {
        mesh.render(pass, this.device, frame.globalBindGroup);
      } else {
        mesh.createGPUResources(this.device, this.format, this.globalLayout);
        mesh.render(pass, this.device, frame.globalBindGroup);
      }
    }
  }

  private renderWireframe(
    pass: GPURenderPassEncoder,
    frame: FrameContext,
    meshes: Mesh[]
  ): void {
    if (!this.wireframePipeline || !this.wireframeBindGroup || !this.wireframeUniformBuffer) {
      this.createWireframeResources();
    }

    for (const mesh of meshes) {
      if (!mesh.isReady) {
        mesh.createGPUResources(this.device, this.format, this.globalLayout);
      }
      const lineIndexData = this.getWireframeIndexData(mesh.geometry);
      mesh.renderWireframe(
        pass,
        this.device,
        frame.globalBindGroup,
        this.wireframeBindGroup!,
        this.wireframePipeline!,
        lineIndexData.buffer,
        lineIndexData.count,
        lineIndexData.format
      );
    }
  }

  private createWireframeResources(): void {
    const shaderModule = this.device.createShaderModule({
      label: 'mesh-wireframe-shader',
      code: wireframeShader,
    });

    this.wireframeUniformBuffer = this.device.createBuffer({
      label: 'mesh-wireframe-uniforms',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(
      this.wireframeUniformBuffer,
      0,
      new Float32Array([0.8, 0.8, 0.9, 1.0]) as unknown as ArrayBuffer
    );

    const wireframeLayout = this.device.createBindGroupLayout({
      label: 'mesh-wireframe-bindGroupLayout',
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      }],
    });

    this.wireframeBindGroup = this.device.createBindGroup({
      label: 'mesh-wireframe-bindGroup',
      layout: wireframeLayout,
      entries: [{
        binding: 0,
        resource: { buffer: this.wireframeUniformBuffer },
      }],
    });

    const modelLayout = this.device.createBindGroupLayout({
      label: 'mesh-wireframe-modelLayout',
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      }],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: 'mesh-wireframe-pipelineLayout',
      bindGroupLayouts: [this.globalLayout, wireframeLayout, modelLayout],
    });

    this.wireframePipeline = this.device.createRenderPipeline({
      label: 'mesh-wireframe-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [{
          arrayStride: 12,
          attributes: [{
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3',
          }],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.format }],
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

  private getWireframeIndexData(geometry: Geometry): WireframeIndexData {
    const cached = this.wireframeIndexCache.get(geometry.id);
    if (cached) return cached;

    const indices = geometry.indices;
    const edgeKeys = new Set<string>();
    const edges: number[] = [];

    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i]!;
      const i1 = indices[i + 1]!;
      const i2 = indices[i + 2]!;
      this.addEdge(edgeKeys, edges, i0, i1);
      this.addEdge(edgeKeys, edges, i1, i2);
      this.addEdge(edgeKeys, edges, i2, i0);
    }

    const useUint32 = geometry.indices instanceof Uint32Array;
    const lineIndices = useUint32 ? new Uint32Array(edges) : new Uint16Array(edges);
    const format: GPUIndexFormat = useUint32 ? 'uint32' : 'uint16';

    const buffer = this.device.createBuffer({
      label: `${geometry.id}-wireframe-indices`,
      size: Math.ceil(lineIndices.byteLength / 4) * 4,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    if (lineIndices.byteLength % 4 !== 0) {
      const padded = new Uint8Array(Math.ceil(lineIndices.byteLength / 4) * 4);
      padded.set(new Uint8Array(lineIndices.buffer));
      this.device.queue.writeBuffer(buffer, 0, padded as unknown as ArrayBuffer);
    } else {
      this.device.queue.writeBuffer(buffer, 0, lineIndices as unknown as ArrayBuffer);
    }

    const data = { buffer, count: lineIndices.length, format };
    this.wireframeIndexCache.set(geometry.id, data);
    return data;
  }

  private addEdge(edgeKeys: Set<string>, edges: number[], a: number, b: number): void {
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    const key = `${min}-${max}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(min, max);
  }
}
