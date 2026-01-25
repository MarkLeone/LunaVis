/**
 * Smoke test: Quick verification that LunaVis starts and renders without errors.
 * Target: < 10 seconds
 *
 * IMPORTANT: This test waits for 'frame-rendered' event to ensure GPU commands
 * actually execute successfully. This catches buffer alignment bugs that would
 * cause GPU hangs after initialization completes.
 */

const { test, expect } = require('@playwright/test');
const { captureConsole, waitForEvent, hasMarker, getErrorMessages } = require('./helpers.cjs');

test.describe('Smoke Test', () => {
  test('LunaVis initializes, renders, and switches render source', async ({ page }) => {
    const capture = captureConsole(page);

    // Navigate to the app
    await page.goto('/');

    // Wait for the ready event (app initialization complete)
    const readyEvent = await waitForEvent(page, capture, 'ready', 5000);
    expect(readyEvent.event).toBe('ready');
    expect(readyEvent.version).toBeDefined();

    // CRITICAL: Wait for first frame to actually render
    // This catches GPU buffer issues that cause hangs during rendering
    const frameEvent = await waitForEvent(page, capture, 'frame-rendered', 5000);
    expect(frameEvent.event).toBe('frame-rendered');

    // Toggle model to Mesh and back to CDLOD
    const modelSelect = page.locator('select:has(option:has-text("CDLOD Sphere"))');
    await modelSelect.selectOption('Utah Teapot');
    await modelSelect.selectOption('CDLOD Sphere');

    // Verify human-readable markers
    expect(hasMarker(capture, '[LunaVis] Ready')).toBe(true);
    expect(hasMarker(capture, '[LunaVis] Frame-rendered')).toBe(true);

    // No console errors (ignore favicon 404)
    const errors = getErrorMessages(capture).filter(
      (msg) => !msg.includes('favicon.ico')
    );
    expect(errors).toEqual([]);

    // Canvas should have non-zero dimensions
    const canvas = page.locator('#gpu-canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });
});
