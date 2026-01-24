/**
 * Camera: Perspective camera with view and projection matrices.
 *
 * Uses mat4.lookAt directly for view matrix computation rather than
 * inverse of world matrix, which is more reliable for camera orientation.
 */

import { mat4, vec3, Mat4, Vec3 } from 'wgpu-matrix';

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
 * Uses explicit eye/target/up for view matrix (mat4.lookAt style).
 *
 * @example
 * ```ts
 * const camera = new Camera({ fov: Math.PI / 4 });
 * camera.setPosition(0, 2, 5);
 * camera.lookAt([0, 0, 0]);
 * const vp = camera.viewProjectionMatrix;
 * ```
 */
export class Camera {
  /** Vertical field of view in radians */
  private _fov: number;
  /** Near clipping plane */
  private _near: number;
  /** Far clipping plane */
  private _far: number;
  /** Aspect ratio (width / height) */
  private _aspect: number;

  /** Camera position in world space */
  private _position: Vec3 = vec3.create(0, 0, 5);
  /** Target point the camera looks at */
  private _target: Vec3 = vec3.create(0, 0, 0);
  /** Up vector */
  private _up: Vec3 = vec3.create(0, 1, 0);

  /** Cached projection matrix */
  private _projectionMatrix: Mat4 = mat4.identity();
  /** Cached view matrix */
  private _viewMatrix: Mat4 = mat4.identity();
  /** Flag indicating projection needs update */
  private _projectionNeedsUpdate = true;
  /** Flag indicating view matrix needs update */
  private _viewNeedsUpdate = true;

  constructor(options: CameraOptions = {}) {
    this._fov = options.fov ?? Math.PI / 4;
    this._near = options.near ?? 0.1;
    this._far = options.far ?? 1000;
    this._aspect = options.aspect ?? 1;
  }

  // --- Position and orientation ---

  get position(): Vec3 {
    return this._position;
  }

  set position(value: Vec3 | [number, number, number]) {
    vec3.copy(value, this._position);
    this._viewNeedsUpdate = true;
  }

  setPosition(x: number, y: number, z: number): this {
    vec3.set(x, y, z, this._position);
    this._viewNeedsUpdate = true;
    return this;
  }

  get target(): Vec3 {
    return this._target;
  }

  set target(value: Vec3 | [number, number, number]) {
    vec3.copy(value, this._target);
    this._viewNeedsUpdate = true;
  }

  setTarget(x: number, y: number, z: number): this {
    vec3.set(x, y, z, this._target);
    this._viewNeedsUpdate = true;
    return this;
  }

  get up(): Vec3 {
    return this._up;
  }

  set up(value: Vec3 | [number, number, number]) {
    vec3.copy(value, this._up);
    this._viewNeedsUpdate = true;
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
   * Get the view matrix (transforms world to camera space).
   * Uses mat4.lookAt for reliable camera orientation.
   */
  get viewMatrix(): Mat4 {
    if (this._viewNeedsUpdate) {
      mat4.lookAt(this._position, this._target, this._up, this._viewMatrix);
      this._viewNeedsUpdate = false;
    }
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
   */
  lookAt(target: Vec3 | [number, number, number]): this {
    vec3.copy(target, this._target);
    this._viewNeedsUpdate = true;
    return this;
  }

  /**
   * Update aspect ratio from canvas dimensions.
   */
  updateAspect(width: number, height: number): void {
    this.aspect = width / height;
  }
}
