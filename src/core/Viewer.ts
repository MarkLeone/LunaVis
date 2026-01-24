/**
 * Viewer: Core WebGPU engine entry point.
 *
 * Handles adapter/device initialization, canvas context configuration,
 * resize handling, and the reactive render loop (dirty-flag pattern).
 */

import { mat4 } from 'wgpu-matrix';
import type { GPUContext, ViewerOptions, Color, RenderState } from '@/types';
import type { Mesh } from '@/objects/Mesh';
import type { Scene } from './Scene';
import type { Camera } from './Camera';

/** Default clear color: Cornflower Blue (#6495ED) */
const DEFAULT_CLEAR_COLOR: Color = [0.392, 0.584, 0.929, 1.0];

/** GPU resources for global uniforms */
interface GlobalResources {
  /** View-projection matrix buffer */
  uniformBuffer: GPUBuffer;
  /** Bind group for global uniforms */
  bindGroup: GPUBindGroup;
  /** Bind group layout (shared with materials) */
  bindGroupLayout: GPUBindGroupLayout;
}

/** Depth buffer resources */
interface DepthResources {
  texture: GPUTexture;
  view: GPUTextureView;
}

/**
 * Main viewer class that encapsulates WebGPU setup and render loop.
 *
 * @example
 * ```ts
 * const viewer = new Viewer({ canvas: document.getElementById('canvas') });
 * await viewer.init();
 * viewer.setScene(scene);
 * viewer.setCamera(camera);
 * ```
 */
export class Viewer {
  private readonly canvas: HTMLCanvasElement;
  private readonly clearColor: Color;

  private gpu: GPUContext | null = null;
  private globalResources: GlobalResources | null = null;
  private depthResources: DepthResources | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private renderState: RenderState = { dirty: true, frameId: null };
  private disposed = false;

  private scene: Scene | null = null;
  private camera: Camera | null = null;

  constructor(options: ViewerOptions) {
    this.canvas = options.canvas;
    this.clearColor = options.clearColor ?? DEFAULT_CLEAR_COLOR;
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

    // Create global resources
    this.createGlobalResources();

    // Setup resize handling
    this.setupResizeObserver();

    // Create initial depth buffer
    this.createDepthBuffer();

    // Start render loop
    this.requestRender();
  }

  /**
   * Create global uniform resources (view-projection matrix).
   */
  private createGlobalResources(): void {
    if (!this.gpu) return;
    const { device } = this.gpu;

    // View-projection matrix buffer (64 bytes for mat4x4)
    const uniformBuffer = device.createBuffer({
      label: 'global-uniforms',
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Bind group layout
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'global-bindGroupLayout',
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      }],
    });

    // Bind group
    const bindGroup = device.createBindGroup({
      label: 'global-bindGroup',
      layout: bindGroupLayout,
      entries: [{
        binding: 0,
        resource: { buffer: uniformBuffer },
      }],
    });

    this.globalResources = { uniformBuffer, bindGroup, bindGroupLayout };
  }

  /**
   * Create depth buffer for depth testing.
   */
  private createDepthBuffer(): void {
    if (!this.gpu) return;
    const { device } = this.gpu;
    const { width, height } = this.pixelSize;

    // Destroy previous depth buffer if exists
    if (this.depthResources) {
      this.depthResources.texture.destroy();
    }

    const texture = device.createTexture({
      label: 'depth-texture',
      size: { width, height },
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.depthResources = {
      texture,
      view: texture.createView(),
    };
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
    this.depthResources?.texture.destroy();
    this.globalResources?.uniformBuffer.destroy();
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

  /** Get the global bind group layout (for materials) */
  get globalBindGroupLayout(): GPUBindGroupLayout {
    if (!this.globalResources) {
      throw new Error('Viewer not initialized');
    }
    return this.globalResources.bindGroupLayout;
  }

  /**
   * Set the active scene to render.
   */
  setScene(scene: Scene): void {
    this.scene = scene;
    this.requestRender();
  }

  /**
   * Set the active camera for rendering.
   */
  setCamera(camera: Camera): void {
    this.camera = camera;
    // Update camera aspect ratio
    const { width, height } = this.pixelSize;
    camera.updateAspect(width, height);
    this.requestRender();
  }

  /**
   * Add a mesh to the scene and create its GPU resources.
   */
  addMesh(mesh: Mesh): void {
    if (!this.gpu || !this.globalResources) {
      throw new Error('Viewer not initialized');
    }
    if (!this.scene) {
      throw new Error('No scene set. Call setScene() first.');
    }

    if (!mesh.isReady) {
      mesh.createGPUResources(
        this.gpu.device,
        this.gpu.format,
        this.globalResources.bindGroupLayout
      );
    }
    this.scene.add(mesh);
    this.requestRender();
  }

  /**
   * Remove a mesh from the scene.
   */
  removeMesh(mesh: Mesh): void {
    if (this.scene) {
      this.scene.remove(mesh);
      this.requestRender();
    }
  }

  /**
   * Setup ResizeObserver to handle canvas resize.
   * Updates canvas backing store and triggers re-render.
   */
  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.updateCanvasSize();
      this.createDepthBuffer();
      if (this.camera) {
        const { width, height } = this.pixelSize;
        this.camera.updateAspect(width, height);
      }
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
   */
  private renderLoop(): void {
    this.renderState.dirty = false;
    this.renderState.frameId = null;

    if (!this.gpu || !this.globalResources || !this.depthResources || this.disposed) return;

    const { device, context } = this.gpu;

    // Update camera uniforms if camera is set
    if (this.camera) {
      const vpMatrix = this.camera.viewProjectionMatrix;
      device.queue.writeBuffer(
        this.globalResources.uniformBuffer,
        0,
        vpMatrix as unknown as ArrayBuffer
      );
    } else {
      // Use identity matrix if no camera
      const identity = mat4.identity();
      device.queue.writeBuffer(
        this.globalResources.uniformBuffer,
        0,
        identity as unknown as ArrayBuffer
      );
    }

    // Get current texture to render to
    const textureView = context.getCurrentTexture().createView();

    // Create command encoder
    const commandEncoder = device.createCommandEncoder({
      label: 'Main Command Encoder',
    });

    // Begin render pass
    const renderPass = commandEncoder.beginRenderPass({
      label: 'Main Render Pass',
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
      depthStencilAttachment: {
        view: this.depthResources.view,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    // Render all meshes in the scene
    if (this.scene) {
      const meshes = this.scene.getMeshes();
      if (meshes.length === 0) {
        console.warn('[LunaVis] No meshes in scene');
      }
      for (const mesh of meshes) {
        if (mesh.isReady) {
          mesh.render(renderPass, device, this.globalResources.bindGroup);
        } else {
          console.warn('[LunaVis] Mesh not ready:', mesh.meshId);
        }
      }
    } else {
      console.warn('[LunaVis] No scene set');
    }

    renderPass.end();

    // Submit commands
    device.queue.submit([commandEncoder.finish()]);
  }
}
