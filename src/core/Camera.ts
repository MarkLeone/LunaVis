/**
 * Camera: Perspective camera with view and projection matrices.
 *
 * Provides view matrix (inverse of camera world transform) and
 * perspective projection matrix.
 */

import { mat4, vec3, Mat4, Vec3 } from 'wgpu-matrix';
import { Object3D } from '@/objects/Object3D';

/** Camera configuration options */
export interface CameraOptions {
  /** Vertical field of view in radians (default: PI/4 = 45 degrees) */
  fov?: number;
  /** Near clipping plane (default: 0.1) */
  near?: number;
  /** Far clipping plane (default: 1000) */
  far?: number;
  /** Aspect ratio (default: 1, should be updated on resize) */
  aspect?: number;
}

/**
 * Perspective camera for 3D rendering.
 *
 * @example
 * ```ts
 * const camera = new Camera({ fov: Math.PI / 4 });
 * camera.position = [0, 0, 5];
 * camera.lookAt([0, 0, 0]);
 * const vp = camera.viewProjectionMatrix;
 * ```
 */
export class Camera extends Object3D {
  /** Vertical field of view in radians */
  private _fov: number;
  /** Near clipping plane */
  private _near: number;
  /** Far clipping plane */
  private _far: number;
  /** Aspect ratio (width / height) */
  private _aspect: number;

  /** Cached projection matrix */
  private _projectionMatrix: Mat4 = mat4.identity();
  /** Cached view matrix */
  private _viewMatrix: Mat4 = mat4.identity();
  /** Flag indicating projection needs update */
  private _projectionNeedsUpdate = true;

  constructor(options: CameraOptions = {}) {
    super();
    this._fov = options.fov ?? Math.PI / 4;
    this._near = options.near ?? 0.1;
    this._far = options.far ?? 1000;
    this._aspect = options.aspect ?? 1;
  }

  // --- Projection parameters ---

  get fov(): number {
    return this._fov;
  }

  set fov(value: number) {
    this._fov = value;
    this._projectionNeedsUpdate = true;
  }

  get near(): number {
    return this._near;
  }

  set near(value: number) {
    this._near = value;
    this._projectionNeedsUpdate = true;
  }

  get far(): number {
    return this._far;
  }

  set far(value: number) {
    this._far = value;
    this._projectionNeedsUpdate = true;
  }

  get aspect(): number {
    return this._aspect;
  }

  set aspect(value: number) {
    this._aspect = value;
    this._projectionNeedsUpdate = true;
  }

  // --- Matrices ---

  /**
   * Get the projection matrix.
   * Uses perspective projection with current fov, aspect, near, far.
   */
  get projectionMatrix(): Mat4 {
    if (this._projectionNeedsUpdate) {
      mat4.perspective(this._fov, this._aspect, this._near, this._far, this._projectionMatrix);
      this._projectionNeedsUpdate = false;
    }
    return this._projectionMatrix;
  }

  /**
   * Get the view matrix (inverse of world matrix).
   * Transforms world space to camera/view space.
   */
  get viewMatrix(): Mat4 {
    mat4.inverse(this.worldMatrix, this._viewMatrix);
    return this._viewMatrix;
  }

  /**
   * Get combined view-projection matrix.
   */
  get viewProjectionMatrix(): Mat4 {
    const vp = mat4.create();
    mat4.multiply(this.projectionMatrix, this.viewMatrix, vp);
    return vp;
  }

  /**
   * Orient camera to look at a target point.
   * Updates rotation to face the target from current position.
   */
  lookAt(target: Vec3 | [number, number, number], _up: Vec3 | [number, number, number] = [0, 1, 0]): this {
    const pos = this.position;
    const dir = vec3.normalize(vec3.subtract(target, pos));

    // Calculate yaw (Y rotation) and pitch (X rotation)
    const yaw = Math.atan2(dir[0]!, dir[2]!);
    const pitch = Math.asin(-dir[1]!);

    this.setRotation(pitch, yaw, 0);

    return this;
  }

  /**
   * Update aspect ratio from canvas dimensions.
   */
  updateAspect(width: number, height: number): void {
    this.aspect = width / height;
  }
}
