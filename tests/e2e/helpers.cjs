/**
 * E2E test helpers for console capture and LunaVis event verification.
 */

/**
 * Set up console capture on a page.
 * Returns object with captured messages, errors, and parsed LunaVis events.
 * @param {import('@playwright/test').Page} page
 * @returns {{ messages: import('@playwright/test').ConsoleMessage[], errors: import('@playwright/test').ConsoleMessage[], events: Object[] }}
 */
function captureConsole(page) {
  const result = {
    messages: [],
    errors: [],
    events: [],
  };

  page.on('console', (msg) => {
    result.messages.push(msg);

    if (msg.type() === 'error') {
      result.errors.push(msg);
    }

    // Try to parse LunaVis structured events
    const text = msg.text();
    if (text.startsWith('{') && text.includes('"event"')) {
      try {
        const event = JSON.parse(text);
        result.events.push(event);
      } catch {
        // Not valid JSON, ignore
      }
    }
  });

  return result;
}

/**
 * Wait for a specific LunaVis event to appear in console.
 * @param {import('@playwright/test').Page} page
 * @param {{ events: Object[] }} capture
 * @param {string} eventName
 * @param {number} timeout
 * @returns {Promise<Object>}
 */
async function waitForEvent(page, capture, eventName, timeout = 5000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const event = capture.events.find((e) => e.event === eventName);
    if (event) return event;
    await page.waitForTimeout(100);
  }

  throw new Error(`Timeout waiting for event: ${eventName}`);
}

/**
 * Check if console contains the human-readable marker.
 * @param {{ messages: import('@playwright/test').ConsoleMessage[] }} capture
 * @param {string} marker
 * @returns {boolean}
 */
function hasMarker(capture, marker) {
  return capture.messages.some((msg) => msg.text().includes(marker));
}

/**
 * Get all console error messages as strings.
 * @param {{ errors: import('@playwright/test').ConsoleMessage[] }} capture
 * @returns {string[]}
 */
function getErrorMessages(capture) {
  return capture.errors.map((msg) => msg.text());
}

module.exports = { captureConsole, waitForEvent, hasMarker, getErrorMessages };
