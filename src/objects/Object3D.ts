/**
 * Object3D: Base class for all 3D scene objects.
 *
 * Provides transform hierarchy (position, rotation, scale),
 * parent/child relationships, and world matrix computation.
 */

import { mat4, vec3, quat, Mat4, Vec3 } from 'wgpu-matrix';
import type { ObjectId } from '@/types';
import { objectId } from '@/types';

/**
 * Base class for all objects in the scene graph.
 *
 * @example
 * ```ts
 * const obj = new Object3D();
 * obj.position = [1, 2, 3];
 * obj.rotation = [0, Math.PI / 4, 0]; // Euler angles (radians)
 * const worldMatrix = obj.worldMatrix;
 * ```
 */
export class Object3D {
  readonly id: ObjectId;

  /** Local position relative to parent */
  private _position: Vec3 = vec3.create(0, 0, 0);
  /** Local rotation as Euler angles (radians, XYZ order) */
  private _rotation: Vec3 = vec3.create(0, 0, 0);
  /** Local scale */
  private _scale: Vec3 = vec3.create(1, 1, 1);

  /** Parent object (null if root) */
  private _parent: Object3D | null = null;
  /** Child objects */
  private _children: Object3D[] = [];

  /** Cached local transform matrix */
  private _localMatrix: Mat4 = mat4.identity();
  /** Cached world transform matrix */
  private _worldMatrix: Mat4 = mat4.identity();

  /** Flag indicating matrices need recalculation */
  private _matrixNeedsUpdate = true;
  /** Flag indicating world matrix needs recalculation */
  private _worldMatrixNeedsUpdate = true;

  constructor() {
    this.id = objectId(`obj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  }

  // --- Position ---

  get position(): Vec3 {
    return this._position;
  }

  set position(value: Vec3 | [number, number, number]) {
    vec3.copy(value, this._position);
    this.markNeedsUpdate();
  }

  setPosition(x: number, y: number, z: number): this {
    vec3.set(x, y, z, this._position);
    this.markNeedsUpdate();
    return this;
  }

  // --- Rotation (Euler angles in radians) ---

  get rotation(): Vec3 {
    return this._rotation;
  }

  set rotation(value: Vec3 | [number, number, number]) {
    vec3.copy(value, this._rotation);
    this.markNeedsUpdate();
  }

  setRotation(x: number, y: number, z: number): this {
    vec3.set(x, y, z, this._rotation);
    this.markNeedsUpdate();
    return this;
  }

  // --- Scale ---

  get scale(): Vec3 {
    return this._scale;
  }

  set scale(value: Vec3 | [number, number, number]) {
    vec3.copy(value, this._scale);
    this.markNeedsUpdate();
  }

  setScale(x: number, y: number, z: number): this {
    vec3.set(x, y, z, this._scale);
    this.markNeedsUpdate();
    return this;
  }

  setUniformScale(s: number): this {
    return this.setScale(s, s, s);
  }

  // --- Parent/Child hierarchy ---

  get parent(): Object3D | null {
    return this._parent;
  }

  get children(): readonly Object3D[] {
    return this._children;
  }

  /**
   * Add a child object to this object.
   * Removes from previous parent if any.
   */
  add(child: Object3D): this {
    if (child._parent === this) return this;

    // Remove from previous parent
    if (child._parent) {
      child._parent.remove(child);
    }

    child._parent = this;
    this._children.push(child);
    child.markWorldMatrixNeedsUpdate();

    return this;
  }

  /**
   * Remove a child object from this object.
   */
  remove(child: Object3D): this {
    const index = this._children.indexOf(child);
    if (index !== -1) {
      this._children.splice(index, 1);
      child._parent = null;
      child.markWorldMatrixNeedsUpdate();
    }
    return this;
  }

  // --- Matrix computation ---

  /**
   * Get the local transform matrix (position * rotation * scale).
   * Recomputed only when transform changes.
   */
  get localMatrix(): Mat4 {
    if (this._matrixNeedsUpdate) {
      this.updateLocalMatrix();
    }
    return this._localMatrix;
  }

  /**
   * Get the world transform matrix (parent.worldMatrix * localMatrix).
   * Recomputed only when this or ancestor transforms change.
   */
  get worldMatrix(): Mat4 {
    if (this._worldMatrixNeedsUpdate) {
      this.updateWorldMatrix();
    }
    return this._worldMatrix;
  }

  /**
   * Update the local matrix from position, rotation, scale.
   */
  private updateLocalMatrix(): void {
    // Build quaternion from Euler angles (XYZ order)
    const q = quat.fromEuler(this._rotation[0]!, this._rotation[1]!, this._rotation[2]!, 'xyz');

    // Compose: T * R * S
    mat4.identity(this._localMatrix);
    mat4.translate(this._localMatrix, this._position, this._localMatrix);
    const rotMat = mat4.fromQuat(q);
    mat4.multiply(this._localMatrix, rotMat, this._localMatrix);
    mat4.scale(this._localMatrix, this._scale, this._localMatrix);

    this._matrixNeedsUpdate = false;
    this._worldMatrixNeedsUpdate = true;
  }

  /**
   * Update the world matrix from parent and local matrix.
   */
  private updateWorldMatrix(): void {
    if (this._matrixNeedsUpdate) {
      this.updateLocalMatrix();
    }

    if (this._parent) {
      mat4.multiply(this._parent.worldMatrix, this._localMatrix, this._worldMatrix);
    } else {
      mat4.copy(this._localMatrix, this._worldMatrix);
    }

    this._worldMatrixNeedsUpdate = false;
  }

  /**
   * Mark local matrix as needing update.
   */
  private markNeedsUpdate(): void {
    this._matrixNeedsUpdate = true;
    this.markWorldMatrixNeedsUpdate();
  }

  /**
   * Mark world matrix as needing update (propagates to children).
   */
  private markWorldMatrixNeedsUpdate(): void {
    this._worldMatrixNeedsUpdate = true;
    for (const child of this._children) {
      child.markWorldMatrixNeedsUpdate();
    }
  }

  /**
   * Traverse this object and all descendants.
   * Callback receives each object.
   */
  traverse(callback: (object: Object3D) => void): void {
    callback(this);
    for (const child of this._children) {
      child.traverse(callback);
    }
  }
}
