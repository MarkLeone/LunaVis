/**
 * OrbitControls: Mouse-based orbit camera controls.
 *
 * Rotate around a target point with click+drag.
 * Zoom with mouse wheel.
 * Pan with right-click+drag or middle-click+drag.
 */

import { vec3, Vec3 } from 'wgpu-matrix';
import type { Camera } from '@/core/Camera';

/** OrbitControls configuration */
export interface OrbitControlsOptions {
  /** Target point to orbit around (default: [0, 0, 0]) */
  target?: Vec3 | [number, number, number];
  /** Rotation sensitivity (default: 0.005) */
  rotateSpeed?: number;
  /** Zoom sensitivity (default: 0.1) */
  zoomSpeed?: number;
  /** Pan sensitivity (default: 0.005) */
  panSpeed?: number;
  /** Minimum distance from target (default: 0.1) */
  minDistance?: number;
  /** Maximum distance from target (default: Infinity) */
  maxDistance?: number;
  /** Minimum polar angle in radians (default: 0) */
  minPolarAngle?: number;
  /** Maximum polar angle in radians (default: PI) */
  maxPolarAngle?: number;
}

/**
 * Orbit controls for rotating camera around a target.
 *
 * @example
 * ```ts
 * const controls = new OrbitControls(camera, canvas);
 * controls.onUpdate = () => viewer.requestRender();
 * // Later: controls.dispose();
 * ```
 */
export class OrbitControls {
  private camera: Camera;
  private element: HTMLElement;

  /** Target point to orbit around */
  private _target: Vec3;

  /** Spherical coordinates: radius (distance from target) */
  private _radius: number;
  /** Spherical coordinates: polar angle (theta, from Y axis) */
  private _polar: number;
  /** Spherical coordinates: azimuthal angle (phi, around Y axis) */
  private _azimuth: number;

  /** Sensitivity settings */
  private rotateSpeed: number;
  private zoomSpeed: number;
  private panSpeed: number;

  /** Distance limits */
  private minDistance: number;
  private maxDistance: number;

  /** Polar angle limits */
  private minPolarAngle: number;
  private maxPolarAngle: number;

  /** Tracking state */
  private isDragging = false;
  private isPanning = false;
  private lastX = 0;
  private lastY = 0;

  /** Callback when camera updates */
  onUpdate: (() => void) | null = null;

  /** Bound event handlers for cleanup */
  private boundOnPointerDown: (e: PointerEvent) => void;
  private boundOnPointerMove: (e: PointerEvent) => void;
  private boundOnPointerUp: (e: PointerEvent) => void;
  private boundOnWheel: (e: WheelEvent) => void;
  private boundOnContextMenu: (e: Event) => void;

  constructor(camera: Camera, element: HTMLElement, options: OrbitControlsOptions = {}) {
    this.camera = camera;
    this.element = element;

    // Initialize target
    this._target = vec3.create(0, 0, 0);
    if (options.target) {
      vec3.copy(options.target, this._target);
    }

    // Initialize spherical coordinates from camera position
    const offset = vec3.subtract(camera.position, this._target);
    this._radius = vec3.length(offset);
    if (this._radius < 0.001) this._radius = 5; // Default distance if camera at target

    // Calculate angles from offset
    this._polar = Math.acos(Math.max(-1, Math.min(1, offset[1]! / this._radius)));
    this._azimuth = Math.atan2(offset[0]!, offset[2]!);

    // Settings
    this.rotateSpeed = options.rotateSpeed ?? 0.005;
    this.zoomSpeed = options.zoomSpeed ?? 0.1;
    this.panSpeed = options.panSpeed ?? 0.005;
    this.minDistance = options.minDistance ?? 0.1;
    this.maxDistance = options.maxDistance ?? Infinity;
    this.minPolarAngle = options.minPolarAngle ?? 0.01; // Avoid gimbal lock
    this.maxPolarAngle = options.maxPolarAngle ?? Math.PI - 0.01;

    // Bind event handlers
    this.boundOnPointerDown = this.onPointerDown.bind(this);
    this.boundOnPointerMove = this.onPointerMove.bind(this);
    this.boundOnPointerUp = this.onPointerUp.bind(this);
    this.boundOnWheel = this.onWheel.bind(this);
    this.boundOnContextMenu = (e: Event) => e.preventDefault();

    // Attach listeners
    element.addEventListener('pointerdown', this.boundOnPointerDown);
    element.addEventListener('pointermove', this.boundOnPointerMove);
    element.addEventListener('pointerup', this.boundOnPointerUp);
    element.addEventListener('pointerleave', this.boundOnPointerUp);
    element.addEventListener('wheel', this.boundOnWheel, { passive: false });
    element.addEventListener('contextmenu', this.boundOnContextMenu);

    // Initial camera update
    this.updateCamera();
  }

  /** Get target position */
  get target(): Vec3 {
    return this._target;
  }

  /** Set target position */
  set target(value: Vec3 | [number, number, number]) {
    vec3.copy(value, this._target);
    this.updateCamera();
  }

  /** Get distance from target */
  get distance(): number {
    return this._radius;
  }

  /** Set distance from target */
  set distance(value: number) {
    this._radius = Math.max(this.minDistance, Math.min(this.maxDistance, value));
    this.updateCamera();
  }

  /**
   * Update camera position from spherical coordinates.
   */
  private updateCamera(): void {
    // Convert spherical to Cartesian
    const sinPolar = Math.sin(this._polar);
    const cosPolar = Math.cos(this._polar);
    const sinAzimuth = Math.sin(this._azimuth);
    const cosAzimuth = Math.cos(this._azimuth);

    const x = this._target[0]! + this._radius * sinPolar * sinAzimuth;
    const y = this._target[1]! + this._radius * cosPolar;
    const z = this._target[2]! + this._radius * sinPolar * cosAzimuth;

    this.camera.setPosition(x, y, z);
    this.camera.lookAt(this._target);

    this.onUpdate?.();
  }

  private onPointerDown(e: PointerEvent): void {
    this.element.setPointerCapture(e.pointerId);
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    // Right button or middle button = pan
    if (e.button === 2 || e.button === 1) {
      this.isPanning = true;
    } else {
      this.isDragging = true;
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.isDragging && !this.isPanning) return;

    const deltaX = e.clientX - this.lastX;
    const deltaY = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    if (this.isPanning) {
      this.pan(deltaX, deltaY);
    } else {
      this.rotate(deltaX, deltaY);
    }
  }

  private onPointerUp(e: PointerEvent): void {
    this.element.releasePointerCapture(e.pointerId);
    this.isDragging = false;
    this.isPanning = false;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    this._radius *= 1 + delta * this.zoomSpeed;
    this._radius = Math.max(this.minDistance, Math.min(this.maxDistance, this._radius));
    this.updateCamera();
  }

  /**
   * Rotate camera around target.
   */
  private rotate(deltaX: number, deltaY: number): void {
    this._azimuth -= deltaX * this.rotateSpeed;
    this._polar += deltaY * this.rotateSpeed;

    // Clamp polar angle
    this._polar = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this._polar));

    this.updateCamera();
  }

  /**
   * Pan camera and target.
   */
  private pan(deltaX: number, deltaY: number): void {
    // Calculate pan vectors in camera space
    const up: Vec3 = vec3.create(0, 1, 0);
    const forward = vec3.normalize(vec3.subtract(this._target, this.camera.position));
    const right = vec3.normalize(vec3.cross(forward, up));
    const cameraUp = vec3.normalize(vec3.cross(right, forward));

    // Pan amount based on distance
    const panX = -deltaX * this.panSpeed * this._radius;
    const panY = deltaY * this.panSpeed * this._radius;

    // Apply pan to target
    vec3.addScaled(this._target, right, panX, this._target);
    vec3.addScaled(this._target, cameraUp, panY, this._target);

    this.updateCamera();
  }

  /**
   * Clean up event listeners.
   */
  dispose(): void {
    this.element.removeEventListener('pointerdown', this.boundOnPointerDown);
    this.element.removeEventListener('pointermove', this.boundOnPointerMove);
    this.element.removeEventListener('pointerup', this.boundOnPointerUp);
    this.element.removeEventListener('pointerleave', this.boundOnPointerUp);
    this.element.removeEventListener('wheel', this.boundOnWheel);
    this.element.removeEventListener('contextmenu', this.boundOnContextMenu);
  }
}
