/**
 * LunaVis entry point.
 * Initializes the WebGPU viewer with a loaded glTF model and orbit controls.
 */

import { Viewer } from '@/core/Viewer';
import { Scene } from '@/core/Scene';
import { Camera } from '@/core/Camera';
import { OrbitControls } from '@/controls/OrbitControls';
import { DirectionalLight } from '@/objects/DirectionalLight';
import { GLTFLoader } from '@/loaders/GLTFLoader';
import { Pane } from 'tweakpane';
import Stats from 'stats.js';
import type { Mesh } from '@/objects/Mesh';
import type { SolidMaterial } from '@/materials/SolidMaterial';
import type { Color } from '@/types';

/** Package version for logging */
const VERSION = '0.1.0';

/** Model configuration */
interface ModelConfig {
  path: string;
  color: Color;
  /** Whether this model has textures that need GPU device for loading */
  textured?: boolean;
  /** Specular intensity (0 = no specular, 1 = full) */
  specularIntensity?: number;
}

/** Available models with display names and default colors */
const MODELS: Record<string, ModelConfig> = {
  'Utah Teapot': {
    path: '/models/utah_teapot.glb',
    color: [0.8, 0.6, 0.4, 1.0],
  },
  'Duck': {
    path: '/models/Duck.glb',
    color: [0.9, 0.7, 0.2, 1.0],
  },
  'Moon': {
    path: '/lunar/scene.gltf',
    color: [1.0, 1.0, 1.0, 1.0],
    textured: true,
    specularIntensity: 0,  // Lunar regolith is purely diffuse
  },
};

/** Default model to load */
const DEFAULT_MODEL = 'Utah Teapot';

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
 * Set up stats.js FPS counter.
 */
function setupStats(): Stats {
  const stats = new Stats();
  stats.showPanel(0); // 0: fps, 1: ms, 2: mb
  stats.dom.style.position = 'absolute';
  stats.dom.style.left = '0px';
  stats.dom.style.top = '0px';
  document.body.appendChild(stats.dom);
  return stats;
}

/** Application state */
interface AppState {
  viewer: Viewer;
  scene: Scene;
  camera: Camera;
  light: DirectionalLight;
  controls: OrbitControls;
  loader: GLTFLoader;
  currentMeshes: Mesh[];
  currentModel: string;
}

/**
 * Update light direction to follow camera.
 * Light is positioned over camera's left shoulder, angled down toward origin.
 */
function updateLightFromCamera(camera: Camera, light: DirectionalLight): void {
  const pos = camera.position;
  const target = camera.target;
  
  // Camera view direction (toward target)
  const vx = (target[0] ?? 0) - (pos[0] ?? 0);
  const vy = (target[1] ?? 0) - (pos[1] ?? 0);
  const vz = (target[2] ?? 0) - (pos[2] ?? 0);
  const vLen = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const viewX = vx / vLen, viewY = vy / vLen, viewZ = vz / vLen;
  
  // World up (Y-up coordinate system)
  const upX = 0, upY = 1, upZ = 0;
  
  // Camera right vector: cross(view, up)
  const rightX = viewY * upZ - viewZ * upY;
  const rightY = viewZ * upX - viewX * upZ;
  const rightZ = viewX * upY - viewY * upX;
  const rLen = Math.sqrt(rightX * rightX + rightY * rightY + rightZ * rightZ);
  const rX = rightX / rLen, rY = rightY / rLen, rZ = rightZ / rLen;
  
  // Camera up vector: cross(right, view)
  const camUpX = rY * viewZ - rZ * viewY;
  const camUpY = rZ * viewX - rX * viewZ;
  const camUpZ = rX * viewY - rY * viewX;
  
  // Light direction: from upper-left of camera view, toward scene
  // -right (from left), +camUp (from above), +view (toward target)
  const lx = -rX * 0.4 + camUpX * 0.4 + viewX * 0.8;
  const ly = -rY * 0.4 + camUpY * 0.4 + viewY * 0.8;
  const lz = -rZ * 0.4 + camUpZ * 0.4 + viewZ * 0.8;
  
  // Normalize and set (light direction points toward scene)
  const lLen = Math.sqrt(lx * lx + ly * ly + lz * lz);
  light.setDirection(lx / lLen, ly / lLen, lz / lLen);
}

/** Bounding box result */
interface BoundingBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
}

/**
 * Calculate bounding box of a mesh's geometry.
 */
function calculateBounds(mesh: Mesh): BoundingBox {
  const positions = mesh.geometry.positions;
  
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    center: {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2,
    },
    size: {
      x: maxX - minX,
      y: maxY - minY,
      z: maxZ - minZ,
    },
  };
}


/**
 * Load a model and add it to the scene.
 */
async function loadModel(state: AppState, modelName: string): Promise<Mesh[]> {
  const modelConfig = MODELS[modelName];
  if (!modelConfig) {
    throw new Error(`Unknown model: ${modelName}`);
  }

  // Clear existing meshes
  state.scene.clear();
  state.currentMeshes = [];

  // Load new model (pass device for textured models)
  emitEvent('model-loading', { url: modelConfig.path });
  const result = await state.loader.load(modelConfig.path, {
    defaultColor: modelConfig.color,
    device: modelConfig.textured ? state.viewer.context.device : undefined,
    specularIntensity: modelConfig.specularIntensity,
  });

  // Add meshes to scene and calculate combined bounds
  let combinedBounds: BoundingBox | null = null;
  for (const mesh of result.meshes) {
    const bounds = calculateBounds(mesh);
    if (!combinedBounds) {
      combinedBounds = bounds;
    } else {
      // Expand to include this mesh
      combinedBounds.min.x = Math.min(combinedBounds.min.x, bounds.min.x);
      combinedBounds.min.y = Math.min(combinedBounds.min.y, bounds.min.y);
      combinedBounds.min.z = Math.min(combinedBounds.min.z, bounds.min.z);
      combinedBounds.max.x = Math.max(combinedBounds.max.x, bounds.max.x);
      combinedBounds.max.y = Math.max(combinedBounds.max.y, bounds.max.y);
      combinedBounds.max.z = Math.max(combinedBounds.max.z, bounds.max.z);
    }
    state.viewer.addMesh(mesh);
    emitEvent('mesh-created', { id: mesh.meshId });
  }
  
  // Position camera based on model bounds
  if (combinedBounds) {
    // Recalculate center from combined bounds
    const center = {
      x: (combinedBounds.min.x + combinedBounds.max.x) / 2,
      y: (combinedBounds.min.y + combinedBounds.max.y) / 2,
      z: (combinedBounds.min.z + combinedBounds.max.z) / 2,
    };
    const size = {
      x: combinedBounds.max.x - combinedBounds.min.x,
      y: combinedBounds.max.y - combinedBounds.min.y,
      z: combinedBounds.max.z - combinedBounds.min.z,
    };
    const maxSize = Math.max(size.x, size.y, size.z);
    
    // Camera distance: 2.5x the model size for good framing
    const dist = maxSize * 2.5;
    
    // Position camera along +Z axis (in front of model, Y-up system)
    state.camera.setPosition(center.x, center.y, center.z + dist);
    state.camera.setTarget(center.x, center.y, center.z);
    
    // Reset orbit controls to match new camera/target
    state.controls.reset([center.x, center.y, center.z]);
    
    // Update light to match new camera position
    updateLightFromCamera(state.camera, state.light);
    
    // Request render with updated camera/light
    state.viewer.requestRender();
  }

  state.currentMeshes = result.meshes;
  state.currentModel = modelName;

  emitEvent('model-loaded', { name: modelName, meshCount: result.meshes.length });

  return result.meshes;
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
    // Set up FPS counter
    const stats = setupStats();

    // Initialize viewer
    const viewer = new Viewer({ canvas });
    await viewer.init();

    // Create scene and camera
    const scene = new Scene();
    const camera = new Camera({ fov: Math.PI / 4 });

    // Initial camera position (will be adjusted per model)
    // Teapot model has top facing +Z, so look from -Y to see it upright
    // Models will be centered at origin
    camera.setPosition(0, -4, 0);
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
    controls.onUpdate = () => {
      updateLightFromCamera(camera, light);
      viewer.requestRender();
    };
    
    // Set initial light direction based on camera
    updateLightFromCamera(camera, light);

    // Create loader
    const loader = new GLTFLoader();

    // Application state
    const state: AppState = {
      viewer,
      scene,
      camera,
      light,
      controls,
      loader,
      currentMeshes: [],
      currentModel: DEFAULT_MODEL,
    };

    // Load initial model
    const meshes = await loadModel(state, DEFAULT_MODEL);

    // Set up debug UI
    setupDebugUI(state);

    // Hook stats into render loop
    const originalRequestRender = viewer.requestRender.bind(viewer);
    viewer.requestRender = () => {
      stats.begin();
      originalRequestRender();
      stats.end();
    };

    // Expose to console for debugging
    Object.assign(window, {
      viewer,
      scene,
      camera,
      light,
      meshes,
      loadModel: (name: string) => loadModel(state, name),
    });

    emitEvent('ready');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(`Failed to initialize:\n${message}`);
  }
}

/**
 * Set up tweakpane debug UI for model selection, light, and material parameters.
 */
function setupDebugUI(state: AppState): void {
  const pane = new Pane({ title: 'LunaVis' });

  // Model selector at the top
  const modelOptions = Object.fromEntries(
    Object.keys(MODELS).map(name => [name, name])
  );
  const modelParams = { model: state.currentModel };

  pane.addBinding(modelParams, 'model', {
    label: 'Model',
    options: modelOptions,
  }).on('change', async (ev) => {
    const modelName = ev.value;
    if (modelName !== state.currentModel) {
      try {
        await loadModel(state, modelName);
        // Update material folder with new mesh
        updateMaterialFolder(state);
      } catch (err) {
        console.error('Failed to load model:', err);
      }
    }
  });

  // Light folder
  const lightFolder = pane.addFolder({ title: 'Light' });

  const lightParams = {
    dirX: state.light.direction[0]!,
    dirY: state.light.direction[1]!,
    dirZ: state.light.direction[2]!,
    color: { r: state.light.color[0]! * 255, g: state.light.color[1]! * 255, b: state.light.color[2]! * 255 },
    intensity: state.light.intensity,
  };

  lightFolder.addBinding(lightParams, 'dirX', { min: -1, max: 1, label: 'Dir X' })
    .on('change', () => {
      state.light.setDirection(lightParams.dirX, lightParams.dirY, lightParams.dirZ);
      state.viewer.requestRender();
    });
  lightFolder.addBinding(lightParams, 'dirY', { min: -1, max: 1, label: 'Dir Y' })
    .on('change', () => {
      state.light.setDirection(lightParams.dirX, lightParams.dirY, lightParams.dirZ);
      state.viewer.requestRender();
    });
  lightFolder.addBinding(lightParams, 'dirZ', { min: -1, max: 1, label: 'Dir Z' })
    .on('change', () => {
      state.light.setDirection(lightParams.dirX, lightParams.dirY, lightParams.dirZ);
      state.viewer.requestRender();
    });
  lightFolder.addBinding(lightParams, 'color', { label: 'Color' })
    .on('change', () => {
      state.light.setColor(
        lightParams.color.r / 255,
        lightParams.color.g / 255,
        lightParams.color.b / 255
      );
      state.viewer.requestRender();
    });
  lightFolder.addBinding(lightParams, 'intensity', { min: 0, max: 2, label: 'Intensity' })
    .on('change', () => {
      state.light.intensity = lightParams.intensity;
      state.viewer.requestRender();
    });

  // Ambient folder
  const ambientFolder = pane.addFolder({ title: 'Ambient' });
  const ambientParams = {
    color: {
      r: state.viewer.ambientColor[0]! * 255,
      g: state.viewer.ambientColor[1]! * 255,
      b: state.viewer.ambientColor[2]! * 255,
    },
  };
  ambientFolder.addBinding(ambientParams, 'color', { label: 'Color' })
    .on('change', () => {
      state.viewer.setAmbientColor([
        ambientParams.color.r / 255,
        ambientParams.color.g / 255,
        ambientParams.color.b / 255,
        1.0,
      ]);
    });

  // Material folder (will be updated when model changes)
  const materialFolder = pane.addFolder({ title: 'Material' });
  (state as AppState & { materialFolder: typeof materialFolder }).materialFolder = materialFolder;
  setupMaterialBindings(state, materialFolder);
}

/**
 * Update material folder when model changes.
 */
function updateMaterialFolder(state: AppState): void {
  const stateWithFolder = state as AppState & { materialFolder: ReturnType<Pane['addFolder']> };
  if (!stateWithFolder.materialFolder) return;

  // Clear existing bindings
  const folder = stateWithFolder.materialFolder;
  while (folder.children.length > 0) {
    folder.children[0]?.dispose();
  }

  // Add new bindings for current mesh
  setupMaterialBindings(state, folder);
}

/**
 * Set up material bindings in a folder.
 */
function setupMaterialBindings(
  state: AppState,
  folder: ReturnType<Pane['addFolder']>
): void {
  const mesh = state.currentMeshes[0];
  if (!mesh) return;

  const material = mesh.material as SolidMaterial;
  const materialParams = {
    color: {
      r: material.color[0]! * 255,
      g: material.color[1]! * 255,
      b: material.color[2]! * 255,
    },
    shininess: material.shininess,
  };

  folder.addBinding(materialParams, 'color', { label: 'Color' })
    .on('change', () => {
      material.color = [
        materialParams.color.r / 255,
        materialParams.color.g / 255,
        materialParams.color.b / 255,
        material.color[3]!,
      ];
      state.viewer.requestRender();
    });

  folder.addBinding(materialParams, 'shininess', { min: 1, max: 256, label: 'Shininess' })
    .on('change', () => {
      material.shininess = materialParams.shininess;
      state.viewer.requestRender();
    });
}

// Start the application
void main();
