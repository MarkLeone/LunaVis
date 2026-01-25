import type { Camera } from './Camera';
import type { DirectionalLight } from '@/objects/DirectionalLight';
import type { Color } from '@/types';

export type RenderMode = 'solid' | 'wireframe';

export interface FrameContext {
  readonly device: GPUDevice;
  readonly globalBindGroup: GPUBindGroup;
  readonly pixelSize: { width: number; height: number };
  readonly camera: Camera;
  readonly light: DirectionalLight | null;
  readonly ambientColor: Color;
}

export interface RenderSource {
  readonly name: string;
  setRenderMode(mode: RenderMode): void;
  update(frame: FrameContext): void;
  render(pass: GPURenderPassEncoder, frame: FrameContext): void;
}
