/**
 * Viewer tests.
 * Note: Full WebGPU testing requires browser environment.
 * These tests verify API surface and error handling.
 */

import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr, meshId, materialId } from '@/types';

describe('Result type helpers', () => {
  it('ok() creates success result', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(42);
    }
  });

  it('err() creates error result', () => {
    const result = err(new Error('test error'));
    expect(result.ok).toBe(false);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toBe('test error');
    }
  });
});

describe('Branded ID types', () => {
  it('meshId creates branded string', () => {
    const id = meshId('mesh-001');
    // TypeScript ensures type safety, runtime is just the string
    expect(id).toBe('mesh-001');
  });

  it('materialId creates branded string', () => {
    const id = materialId('mat-001');
    expect(id).toBe('mat-001');
  });
});
