/**
 * DirectionalLight: A light that shines uniformly in one direction.
 *
 * Models distant light sources like the sun where all rays are parallel.
 */

import { vec3, Vec3 } from 'wgpu-matrix';

/** DirectionalLight configuration */
export interface DirectionalLightOptions {
  /** Light direction (will be normalized) */
  direction?: Vec3 | [number, number, number];
  /** Light color RGB (0-1 range) */
  color?: Vec3 | [number, number, number];
  /** Light intensity multiplier (default: 1.0) */
  intensity?: number;
}

/**
 * Directional light for Blinn-Phong shading.
 *
 * @example
 * ```ts
 * const light = new DirectionalLight({
 *   direction: [1, -1, -1],
 *   color: [1, 1, 1],
 *   intensity: 1.0,
 * });
 * ```
 */
export class DirectionalLight {
  /** Normalized light direction (points toward light source) */
  private _direction: Vec3 = vec3.create(-0.5, -1.0, -0.5);
  /** Light color RGB */
  private _color: Vec3 = vec3.create(1, 1, 1);
  /** Intensity multiplier */
  private _intensity: number = 1.0;

  /** Flag for uniform updates */
  needsUpdate = true;

  constructor(options: DirectionalLightOptions = {}) {
    if (options.direction) {
      this.setDirection(options.direction);
    } else {
      vec3.normalize(this._direction, this._direction);
    }

    if (options.color) {
      vec3.copy(options.color, this._color);
    }

    if (options.intensity !== undefined) {
      this._intensity = options.intensity;
    }
  }

  // --- Direction ---

  get direction(): Vec3 {
    return this._direction;
  }

  set direction(value: Vec3 | [number, number, number]) {
    this.setDirection(value);
  }

  setDirection(x: number | Vec3 | [number, number, number], y?: number, z?: number): this {
    if (typeof x === 'number') {
      vec3.set(x, y!, z!, this._direction);
    } else {
      vec3.copy(x, this._direction);
    }
    vec3.normalize(this._direction, this._direction);
    this.needsUpdate = true;
    return this;
  }

  // --- Color ---

  get color(): Vec3 {
    return this._color;
  }

  set color(value: Vec3 | [number, number, number]) {
    vec3.copy(value, this._color);
    this.needsUpdate = true;
  }

  setColor(r: number, g: number, b: number): this {
    vec3.set(r, g, b, this._color);
    this.needsUpdate = true;
    return this;
  }

  // --- Intensity ---

  get intensity(): number {
    return this._intensity;
  }

  set intensity(value: number) {
    this._intensity = value;
    this.needsUpdate = true;
  }

  /**
   * Get the effective light color (color * intensity).
   */
  get effectiveColor(): Vec3 {
    return vec3.scale(this._color, this._intensity);
  }
}
