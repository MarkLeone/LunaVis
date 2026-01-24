/**
 * LunaVis entry point.
 * Initializes the WebGPU viewer with a rotating cube and orbit controls.
 */

import { Viewer } from '@/core/Viewer';
import { Scene } from '@/core/Scene';
import { Camera } from '@/core/Camera';
import { createCube } from '@/geometry/primitives';
import { SolidMaterial } from '@/materials/SolidMaterial';
import { Mesh } from '@/objects/Mesh';
import { OrbitControls } from '@/controls/OrbitControls';

/** Package version for logging */
const VERSION = '0.1.0';

/**
 * Emit a structured event for test verification.
 * Logs both human-readable marker and JSON for machine parsing.
 */
function emitEvent(event: string, data: Record<string, unknown> = {}): void {
  // Human-readable marker
  console.info(`[LunaVis] ${event.charAt(0).toUpperCase() + event.slice(1)}`);
  // Machine-parseable JSON
  console.info(JSON.stringify({ event, version: VERSION, ...data }));
}

/**
 * Display error message to user when WebGPU fails.
 */
function showError(message: string): void {
  const container = document.getElementById('error-container');
  if (container) {
    container.textContent = message;
    container.style.display = 'block';
  }
  console.error('[LunaVis] Error:', message);
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
    // Initialize viewer
    const viewer = new Viewer({ canvas });
    await viewer.init();

    // Create scene and camera
    const scene = new Scene();
    const camera = new Camera({ fov: Math.PI / 4 });

    // Position camera to view the cube
    camera.setPosition(0, 2, 5);
    camera.lookAt([0, 0, 0]);

    // Set up viewer
    viewer.setScene(scene);
    viewer.setCamera(camera);

    // Create orbit controls
    const controls = new OrbitControls(camera, canvas);
    controls.onUpdate = () => viewer.requestRender();

    // Create a cube mesh
    const geometry = createCube();
    const material = new SolidMaterial({ color: [0.8, 0.3, 0.2, 1.0] }); // Red-orange
    const cube = new Mesh(geometry, material);

    // Add cube to scene
    viewer.addMesh(cube);
    emitEvent('mesh-created', { id: cube.meshId });

    // Animate cube rotation
    let lastTime = performance.now();
    function animate(time: number): void {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      // Rotate cube around Y axis
      const rotation = cube.rotation;
      cube.setRotation(rotation[0]!, rotation[1]! + dt * 0.5, rotation[2]!);

      viewer.requestRender();
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);

    // Expose viewer to console for debugging
    (window as unknown as { viewer: Viewer; scene: Scene; camera: Camera; cube: Mesh }).viewer = viewer;
    (window as unknown as { viewer: Viewer; scene: Scene; camera: Camera; cube: Mesh }).scene = scene;
    (window as unknown as { viewer: Viewer; scene: Scene; camera: Camera; cube: Mesh }).camera = camera;
    (window as unknown as { viewer: Viewer; scene: Scene; camera: Camera; cube: Mesh }).cube = cube;

    emitEvent('ready');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(`Failed to initialize WebGPU:\n${message}`);
  }
}

// Start the application
void main();
