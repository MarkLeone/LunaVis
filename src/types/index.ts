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

/** Type-safe geometry identifier */
export type GeometryId = Brand<string, 'GeometryId'>;

/** Type-safe object identifier */
export type ObjectId = Brand<string, 'ObjectId'>;

/** Type-safe QuadNode identifier */
export type QuadNodeId = Brand<string, 'QuadNodeId'>;

/** Cube face identifier (0=+Z, 1=-Z, 2=+X, 3=-X, 4=+Y, 5=-Y) */
export type FaceId = 0 | 1 | 2 | 3 | 4 | 5;

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

/**
 * Creates a branded GeometryId from a string.
 */
export function geometryId(id: string): GeometryId {
  return id as GeometryId;
}

/**
 * Creates a branded ObjectId from a string.
 */
export function objectId(id: string): ObjectId {
  return id as ObjectId;
}

/**
 * Creates a branded QuadNodeId from a string.
 */
export function quadNodeId(id: string): QuadNodeId {
  return id as QuadNodeId;
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
