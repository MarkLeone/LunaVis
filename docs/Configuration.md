# LunaVis Configuration Guide

Project configuration for the WebGPU 3D viewer.

## Package Configuration

### package.json

```json
{
  "name": "lunavis",
  "version": "0.1.0",
  "type": "module"
}
```

**Dependencies:**
| Package | Version | Purpose |
|---------|---------|---------|
| `wgpu-matrix` | ^3.3.0 | WebGPU-optimized matrix math (column-major) |

**Dev Dependencies:**
| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.7.3 | Language |
| `vite` | ^6.0.7 | Build tool, dev server, HMR |
| `vitest` | ^3.0.4 | Test framework |
| `@webgpu/types` | ^0.1.54 | WebGPU TypeScript definitions |

**Scripts:**
```bash
npm run dev        # Start Vite dev server (port 3000)
npm run build      # Type-check + production build
npm run preview    # Preview production build
npm run test       # Run tests once
npm run test:watch # Run tests in watch mode
```

---

## TypeScript Configuration

### tsconfig.json

**Target & Module:**
```json
{
  "target": "ES2022",
  "module": "ESNext",
  "moduleResolution": "bundler",
  "lib": ["ES2022", "DOM", "DOM.Iterable"]
}
```

**Strict Settings (all enabled):**
- `strict: true` — Master switch
- `strictNullChecks: true` — No implicit null/undefined
- `noImplicitAny: true` — Explicit types required
- `noImplicitReturns: true` — All code paths must return
- `noUnusedLocals: true` — No dead variables
- `noUnusedParameters: true` — No unused function params
- `exactOptionalPropertyTypes: true` — Optional props can't be `undefined` unless declared
- `noUncheckedIndexedAccess: true` — Array/object index access returns `T | undefined`

**Path Aliases:**
```json
{
  "baseUrl": ".",
  "paths": {
    "@/*": ["src/*"]
  }
}
```

Usage: `import { Viewer } from '@/core/Viewer'`

**WebGPU Types:**
```json
{
  "types": ["@webgpu/types"]
}
```

This adds `navigator.gpu`, `GPUDevice`, `GPUBuffer`, etc. to the global scope.

---

## Vite Configuration

### vite.config.ts

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  assetsInclude: ['**/*.wgsl'],
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
  },
});
```

**Key Settings:**
- **Path alias:** `@/` maps to `src/` (must match tsconfig)
- **WGSL imports:** Shaders can be imported as raw strings via `?raw` suffix
- **Build target:** `esnext` for WebGPU compatibility (no transpilation)

**Shader Import Example:**
```typescript
import shaderCode from '@/shaders/blinn-phong.wgsl?raw';
// shaderCode is a string containing the WGSL source
```

---

## Vitest Configuration

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
```

**Settings:**
- `globals: false` — Explicit imports (`import { describe, it } from 'vitest'`)
- `environment: 'node'` — Tests run in Node, not browser (WebGPU mocking required for GPU tests)
- Path alias matches Vite/TypeScript config

---

## Project Structure

```
LunaVis/
├── src/
│   ├── core/           # Viewer, Renderer, Scene, Camera
│   ├── objects/        # Object3D, Mesh, Lights
│   ├── geometry/       # Geometry, primitives
│   ├── materials/      # Material classes
│   ├── loaders/        # glTF loader
│   ├── controls/       # OrbitControls, FlyControls
│   ├── shaders/        # *.wgsl files
│   ├── types/          # TypeScript type definitions
│   └── main.ts         # Entry point
├── tests/              # Test files (*.test.ts)
├── public/
│   └── assets/         # Static assets, .glb models
├── docs/               # Documentation
├── index.html          # HTML entry point
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── .gitignore
```

---

## HTML Entry Point

### index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LunaVis - WebGPU Viewer</title>
</head>
<body>
  <canvas id="gpu-canvas"></canvas>
  <div id="error-container"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

**Styling:**
- Canvas fills viewport (`width: 100%; height: 100%`)
- No margin/padding on body
- Error container hidden by default, shown on WebGPU failure
- Background: `#1a1a2e` (dark blue-gray)

---

## Git Configuration

### .gitignore

```
node_modules/
dist/
*.local
.DS_Store
*.log
coverage/
```

---

## Environment Requirements

| Requirement | Minimum | Notes |
|-------------|---------|-------|
| Node.js | 18.x, 20.x, or 22+ | v19 works with warnings |
| Browser | Chrome 113+ / Edge 113+ | WebGPU required |
| npm | 9.x+ | Included with Node |

**WebGPU Browser Support:**
- Chrome/Edge: Stable (enabled by default)
- Firefox: Requires `about:config` → `dom.webgpu.enabled` → `true`
- Safari: Technology Preview only

No fallback implemented — WebGPU required.

**Note (Hybrid GPU Laptops):** Chrome may default to integrated Intel GPU which has Vulkan driver issues on Linux. Firefox handles hybrid GPU selection better. See DevLog.md for details.

---

## Adding New Dependencies

When adding packages, update this document with:
1. Package name and version
2. Purpose / why it was added
3. Any configuration required

Example future additions:
- `tweakpane` — Debug UI for light/camera parameters
- `stats.js` — FPS monitoring overlay
