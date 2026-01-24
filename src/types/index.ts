/**
 * Core type definitions for LunaVis WebGPU viewer.
 * Uses branded types for type-safe IDs and strict typing throughout.
 */

/** Branded type helper for nominal typing */
type Brand<T, B> = T & { readonly __brand: B };

/** Type-safe mesh identifier */
export type MeshId = Brand<string, 'MeshId'>;

/** Type-safe material identifier */
export type MaterialId = Brand<string, 'MaterialId'>;

/** 3D vector as tuple (x, y, z) */
export type Vec3 = readonly [number, number, number];

/** 4D vector as tuple (x, y, z, w) */
export type Vec4 = readonly [number, number, number, number];

/** RGBA color (0-1 range) */
export type Color = Vec4;

/** Result type for fallible operations */
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** WebGPU initialization result */
export interface GPUContext {
  readonly adapter: GPUAdapter;
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext;
  readonly format: GPUTextureFormat;
}

/** Viewer configuration options */
export interface ViewerOptions {
  /** Canvas element to render to */
  readonly canvas: HTMLCanvasElement;
  /** Clear color (default: cornflower blue) */
  readonly clearColor?: Color;
  /** Power preference for adapter selection */
  readonly powerPreference?: GPUPowerPreference;
}

/** Render state for dirty-flag tracking */
export interface RenderState {
  dirty: boolean;
  frameId: number | null;
}

/**
 * Creates a branded MeshId from a string.
 * Use for type-safe mesh identification.
 */
export function meshId(id: string): MeshId {
  return id as MeshId;
}

/**
 * Creates a branded MaterialId from a string.
 */
export function materialId(id: string): MaterialId {
  return id as MaterialId;
}

/** Type guard for successful Result */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

/** Type guard for failed Result */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/** Helper to create success Result */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Helper to create error Result */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
