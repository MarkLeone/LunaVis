/**
 * Viewer: Core WebGPU engine entry point.
 *
 * Handles adapter/device initialization, canvas context configuration,
 * resize handling, and the reactive render loop (dirty-flag pattern).
 */

import type { GPUContext, ViewerOptions, Color, RenderState } from '@/types';

/** Default clear color: Cornflower Blue (#6495ED) */
const DEFAULT_CLEAR_COLOR: Color = [0.392, 0.584, 0.929, 1.0];

/**
 * Main viewer class that encapsulates WebGPU setup and render loop.
 *
 * @example
 * ```ts
 * const viewer = new Viewer({ canvas: document.getElementById('canvas') });
 * await viewer.init();
 * // Viewer is now rendering
 * ```
 */
export class Viewer {
  private readonly canvas: HTMLCanvasElement;
  private readonly clearColor: Color;
  private readonly powerPreference: GPUPowerPreference;

  private gpu: GPUContext | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private renderState: RenderState = { dirty: true, frameId: null };
  private disposed = false;

  constructor(options: ViewerOptions) {
    this.canvas = options.canvas;
    this.clearColor = options.clearColor ?? DEFAULT_CLEAR_COLOR;
    this.powerPreference = options.powerPreference ?? 'high-performance';
  }

  /**
   * Initialize WebGPU: adapter, device, and canvas context.
   * Throws if WebGPU is not available or initialization fails.
   */
  async init(): Promise<void> {
    if (this.gpu) {
      throw new Error('Viewer already initialized');
    }

    // Check WebGPU support
    if (!navigator.gpu) {
      throw new Error('WebGPU not supported in this browser');
    }

    // Request discrete GPU to avoid Intel Arc driver issues
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });

    if (!adapter) {
      throw new Error('Failed to acquire GPUAdapter - no compatible GPU found');
    }

    // Request device
    const device = await adapter.requestDevice();
    device.lost.then((info) => {
      console.error('WebGPU device lost:', info.message);
      // Don't auto-recover — let the user refresh manually
      this.gpu = null;
    });

    // Configure canvas context
    const context = this.canvas.getContext('webgpu');
    if (!context) {
      throw new Error('Failed to get WebGPU canvas context');
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format,
      alphaMode: 'premultiplied',
    });

    this.gpu = { adapter, device, context, format };

    // Setup resize handling
    this.setupResizeObserver();

    // Start render loop
    this.requestRender();
  }

  /**
   * Request a render on the next animation frame.
   * Multiple calls coalesce into a single frame (dirty-flag pattern).
   */
  requestRender(): void {
    if (this.disposed) return;

    this.renderState.dirty = true;
    // Only schedule if no frame is already pending
    if (this.renderState.frameId === null) {
      this.renderState.frameId = requestAnimationFrame(() => this.renderLoop());
    }
  }

  /**
   * Clean up all GPU resources and observers.
   */
  dispose(): void {
    this.disposed = true;

    if (this.renderState.frameId !== null) {
      cancelAnimationFrame(this.renderState.frameId);
    }

    this.resizeObserver?.disconnect();
    this.gpu?.device.destroy();
    this.gpu = null;
  }

  /** Get the GPU context (throws if not initialized) */
  get context(): GPUContext {
    if (!this.gpu) {
      throw new Error('Viewer not initialized. Call init() first.');
    }
    return this.gpu;
  }

  /** Check if viewer is initialized */
  get isInitialized(): boolean {
    return this.gpu !== null;
  }

  /** Get canvas dimensions in physical pixels */
  get pixelSize(): { width: number; height: number } {
    const dpr = window.devicePixelRatio || 1;
    return {
      width: Math.floor(this.canvas.clientWidth * dpr),
      height: Math.floor(this.canvas.clientHeight * dpr),
    };
  }

  /**
   * Setup ResizeObserver to handle canvas resize.
   * Updates canvas backing store and triggers re-render.
   */
  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.updateCanvasSize();
      this.requestRender();
    });
    this.resizeObserver.observe(this.canvas);

    // Initial size update
    this.updateCanvasSize();
  }

  /**
   * Update canvas backing store to match display size.
   * Handles device pixel ratio for sharp rendering.
   */
  private updateCanvasSize(): void {
    const { width, height } = this.pixelSize;

    // Avoid unnecessary resize if dimensions match
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  /**
   * Main render loop callback.
   * Currently just clears to the background color.
   */
  private renderLoop(): void {
    this.renderState.dirty = false;
    this.renderState.frameId = null;

    if (!this.gpu || this.disposed) return;

    const { device, context } = this.gpu;

    // Get current texture to render to
    const textureView = context.getCurrentTexture().createView();

    // Create command encoder
    const commandEncoder = device.createCommandEncoder({
      label: 'Main Command Encoder',
    });

    // Begin render pass (clear only for M1)
    const renderPass = commandEncoder.beginRenderPass({
      label: 'Clear Pass',
      colorAttachments: [{
        view: textureView,
        clearValue: {
          r: this.clearColor[0],
          g: this.clearColor[1],
          b: this.clearColor[2],
          a: this.clearColor[3],
        },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    renderPass.end();

    // Submit commands
    device.queue.submit([commandEncoder.finish()]);
  }
}
