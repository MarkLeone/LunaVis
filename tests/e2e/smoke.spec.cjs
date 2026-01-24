/**
 * Smoke test: Quick verification that LunaVis starts without errors.
 * Target: < 10 seconds
 */

const { test, expect } = require('@playwright/test');
const { captureConsole, waitForEvent, hasMarker, getErrorMessages } = require('./helpers.cjs');

test.describe('Smoke Test', () => {
  test('LunaVis initializes and renders', async ({ page }) => {
    const capture = captureConsole(page);

    // Navigate to the app
    await page.goto('/');

    // Wait for the ready event (structured)
    const readyEvent = await waitForEvent(page, capture, 'ready', 5000);
    expect(readyEvent.event).toBe('ready');
    expect(readyEvent.version).toBeDefined();

    // Verify human-readable marker also present
    expect(hasMarker(capture, '[LunaVis] Ready')).toBe(true);

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
