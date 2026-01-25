import type { RenderMode, RenderSource, FrameContext } from '@/core/RenderSource';
import { TerrainRenderer } from './TerrainRenderer';
import type { TerrainDebugConfig, DebugRenderStats } from './DebugRenderer';

type OverlayCallback = (stats: DebugRenderStats | null) => void;

export class CDLODRenderSource implements RenderSource {
  readonly name = 'CDLOD';

  private readonly renderer: TerrainRenderer;
  private mode: RenderMode = 'solid';
  private overlayCallback: OverlayCallback | null = null;
  private hasSelection = false;

  constructor(
    device: GPUDevice,
    format: GPUTextureFormat,
    globalBindGroupLayout: GPUBindGroupLayout,
    config?: Partial<TerrainDebugConfig>
  ) {
    this.renderer = new TerrainRenderer(config);
    this.renderer.init(device, format, globalBindGroupLayout);
  }

  setRenderMode(mode: RenderMode): void {
    this.mode = mode;
    this.renderer.setRenderMode(mode);
  }

  setConfig(config: Partial<TerrainDebugConfig>): void {
    this.renderer.setConfig(config);
  }

  getConfig(): Readonly<TerrainDebugConfig> {
    return this.renderer.config;
  }

  setOverlayCallback(callback: OverlayCallback | null): void {
    this.overlayCallback = callback;
  }

  getStats(): DebugRenderStats | null {
    return this.renderer.lastStats;
  }

  update(frame: FrameContext): void {
    const freeze = this.mode === 'wireframe' || this.renderer.config.freezeLOD;
    if (freeze && this.hasSelection) return;

    const cameraPos = new Float64Array([
      frame.camera.position[0]!,
      frame.camera.position[1]!,
      frame.camera.position[2]!,
    ]);
    const viewProjection = frame.camera.viewProjectionMatrix as Float32Array;
    this.renderer.selectNodes(cameraPos, viewProjection, frame.pixelSize.height, frame.camera.fov);
    this.hasSelection = true;
  }

  render(pass: GPURenderPassEncoder, frame: FrameContext): void {
    this.renderer.render(pass, frame.globalBindGroup);
    this.overlayCallback?.(this.renderer.lastStats);
  }
}
