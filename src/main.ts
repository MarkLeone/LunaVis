/**
 * LunaVis entry point.
 * Initializes the WebGPU viewer and handles setup errors.
 */

import { Viewer } from '@/core/Viewer';

/**
 * Display error message to user when WebGPU fails.
 */
function showError(message: string): void {
  const container = document.getElementById('error-container');
  if (container) {
    container.textContent = message;
    container.style.display = 'block';
  }
  console.error('LunaVis Error:', message);
}

/**
 * Main initialization function.
 */
async function main(): Promise<void> {
  const canvas = document.getElementById('gpu-canvas') as HTMLCanvasElement | null;

  if (!canvas) {
    showError('Canvas element #gpu-canvas not found');
    return;
  }

  // Check WebGPU support early for better error message
  if (!navigator.gpu) {
    showError(
      'WebGPU is not supported in this browser.\n' +
      'Please use Chrome 113+ or Edge 113+ with WebGPU enabled.'
    );
    return;
  }

  try {
    const viewer = new Viewer({ canvas });
    await viewer.init();

    // Expose viewer to console for debugging
    (window as unknown as { viewer: Viewer }).viewer = viewer;

    console.log('LunaVis initialized successfully');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(`Failed to initialize WebGPU:\n${message}`);
  }
}

// Start the application
void main();
