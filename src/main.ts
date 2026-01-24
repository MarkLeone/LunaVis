/**
 * LunaVis entry point.
 * Initializes the WebGPU viewer with a lit cube and orbit controls.
 */

import { Viewer } from '@/core/Viewer';
import { Scene } from '@/core/Scene';
import { Camera } from '@/core/Camera';
import { createCube } from '@/geometry/primitives';
import { SolidMaterial } from '@/materials/SolidMaterial';
import { Mesh } from '@/objects/Mesh';
import { OrbitControls } from '@/controls/OrbitControls';
import { DirectionalLight } from '@/objects/DirectionalLight';
import { Pane } from 'tweakpane';

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
    camera.setTarget(0, 0, 0);

    // Set up viewer
    viewer.setScene(scene);
    viewer.setCamera(camera);

    // Create directional light
    const light = new DirectionalLight({
      direction: [-0.5, -1.0, -0.5],
      color: [1, 1, 1],
      intensity: 1.0,
    });
    viewer.setLight(light);

    // Create orbit controls
    const controls = new OrbitControls(camera, canvas);
    controls.onUpdate = () => viewer.requestRender();

    // Create a cube mesh
    const geometry = createCube();
    const material = new SolidMaterial({
      color: [0.8, 0.3, 0.2, 1.0], // Red-orange
      shininess: 32,
    });
    const cube = new Mesh(geometry, material);

    // Add cube to scene
    viewer.addMesh(cube);
    emitEvent('mesh-created', { id: cube.meshId });

    // Set up debug UI
    setupDebugUI(viewer, light, material);

    // Expose viewer to console for debugging
    (window as unknown as { viewer: Viewer; scene: Scene; camera: Camera; cube: Mesh; light: DirectionalLight }).viewer = viewer;
    (window as unknown as { viewer: Viewer; scene: Scene; camera: Camera; cube: Mesh; light: DirectionalLight }).scene = scene;
    (window as unknown as { viewer: Viewer; scene: Scene; camera: Camera; cube: Mesh; light: DirectionalLight }).camera = camera;
    (window as unknown as { viewer: Viewer; scene: Scene; camera: Camera; cube: Mesh; light: DirectionalLight }).cube = cube;
    (window as unknown as { viewer: Viewer; scene: Scene; camera: Camera; cube: Mesh; light: DirectionalLight }).light = light;

    emitEvent('ready');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(`Failed to initialize WebGPU:\n${message}`);
  }
}

/**
 * Set up tweakpane debug UI for light and material parameters.
 */
function setupDebugUI(
  viewer: Viewer,
  light: DirectionalLight,
  material: SolidMaterial
): void {
  const pane = new Pane({ title: 'LunaVis Debug' });

  // Light folder
  const lightFolder = pane.addFolder({ title: 'Light' });

  // Light direction (as individual components)
  const lightParams = {
    dirX: light.direction[0]!,
    dirY: light.direction[1]!,
    dirZ: light.direction[2]!,
    color: { r: light.color[0]! * 255, g: light.color[1]! * 255, b: light.color[2]! * 255 },
    intensity: light.intensity,
  };

  lightFolder.addBinding(lightParams, 'dirX', { min: -1, max: 1, label: 'Dir X' })
    .on('change', () => {
      light.setDirection(lightParams.dirX, lightParams.dirY, lightParams.dirZ);
      viewer.requestRender();
    });
  lightFolder.addBinding(lightParams, 'dirY', { min: -1, max: 1, label: 'Dir Y' })
    .on('change', () => {
      light.setDirection(lightParams.dirX, lightParams.dirY, lightParams.dirZ);
      viewer.requestRender();
    });
  lightFolder.addBinding(lightParams, 'dirZ', { min: -1, max: 1, label: 'Dir Z' })
    .on('change', () => {
      light.setDirection(lightParams.dirX, lightParams.dirY, lightParams.dirZ);
      viewer.requestRender();
    });
  lightFolder.addBinding(lightParams, 'color', { label: 'Color' })
    .on('change', () => {
      light.setColor(
        lightParams.color.r / 255,
        lightParams.color.g / 255,
        lightParams.color.b / 255
      );
      viewer.requestRender();
    });
  lightFolder.addBinding(lightParams, 'intensity', { min: 0, max: 2, label: 'Intensity' })
    .on('change', () => {
      light.intensity = lightParams.intensity;
      viewer.requestRender();
    });

  // Ambient folder
  const ambientFolder = pane.addFolder({ title: 'Ambient' });
  const ambientParams = {
    color: {
      r: viewer.ambientColor[0]! * 255,
      g: viewer.ambientColor[1]! * 255,
      b: viewer.ambientColor[2]! * 255,
    },
  };
  ambientFolder.addBinding(ambientParams, 'color', { label: 'Color' })
    .on('change', () => {
      viewer.setAmbientColor([
        ambientParams.color.r / 255,
        ambientParams.color.g / 255,
        ambientParams.color.b / 255,
        1.0,
      ]);
    });

  // Material folder
  const materialFolder = pane.addFolder({ title: 'Material' });
  const materialParams = {
    color: {
      r: material.color[0]! * 255,
      g: material.color[1]! * 255,
      b: material.color[2]! * 255,
    },
    shininess: material.shininess,
  };
  materialFolder.addBinding(materialParams, 'color', { label: 'Color' })
    .on('change', () => {
      material.color = [
        materialParams.color.r / 255,
        materialParams.color.g / 255,
        materialParams.color.b / 255,
        material.color[3]!,
      ];
      viewer.requestRender();
    });
  materialFolder.addBinding(materialParams, 'shininess', { min: 1, max: 256, label: 'Shininess' })
    .on('change', () => {
      material.shininess = materialParams.shininess;
      viewer.requestRender();
    });
}

// Start the application
void main();
