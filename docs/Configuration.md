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
| `tweakpane` | ^4.0.5 | Debug UI for light/material parameters |
| `@tweakpane/core` | ^2.0.5 | Tweakpane type definitions |
| `@loaders.gl/core` | ^4.x | Asset loading framework |
| `@loaders.gl/gltf` | ^4.x | glTF/GLB model parsing |
| `stats.js` | ^0.17.0 | FPS counter overlay |

**Dev Dependencies:**
| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.7.3 | Language |
| `vite` | ^6.0.7 | Build tool, dev server, HMR |
| `vitest` | ^3.0.4 | Unit test framework |
| `@playwright/test` | ^1.58.0 | E2E testing with Firefox |
| `@webgpu/types` | ^0.1.54 | WebGPU TypeScript definitions |

**Scripts:** `dev`, `build`, `preview`, `download-assets`, `convert-textures`, `test`, `test:watch`, `test:smoke`, `test:e2e`

See [BuildAndTest.md](BuildAndTest.md) for usage details.

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

Combines Vite build settings and Vitest test configuration in one file.

```typescript
/// <reference types="vitest" />
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
  // Vitest configuration
  test: {
    globals: false,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
});
```

**Vite Settings:**
- **Path alias:** `@/` maps to `src/` (must match tsconfig)
- **WGSL imports:** Shaders can be imported as raw strings via `?raw` suffix
- **Build target:** `esnext` for WebGPU compatibility (no transpilation)
- **Public dir:** `assets/` folder served at root URL (e.g., `/models/Duck.glb`)

**Vitest Settings:**
- `globals: false` — Explicit imports (`import { describe, it } from 'vitest'`)
- `environment: 'node'` — Tests run in Node (WebGPU mocking required for GPU tests)
- `exclude` — Skips e2e/ directory (handled by Playwright)

**Shader Import Example:**
```typescript
import shaderCode from '@/shaders/blinn-phong.wgsl?raw';
// shaderCode is a string containing the WGSL source
```

---

## Playwright Configuration

### tests/e2e/playwright.config.cjs

E2E testing with Firefox and WebGPU. Located in `tests/e2e/` to reduce root clutter. Uses `.cjs` extension for Node 19 compatibility.

```javascript
const { devices } = require('@playwright/test');

module.exports = {
  testDir: '.',  // Relative to config file location
  timeout: 30000,
  workers: 1,
  projects: [{
    name: 'firefox-webgpu',
    use: {
      ...devices['Desktop Firefox'],
      headless: false,  // WebGPU requires headed mode
      launchOptions: {
        firefoxUserPrefs: {
          'dom.webgpu.enabled': true,
          'gfx.webgpu.ignore-blocklist': true,
        },
      },
    },
  }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
};
```

**Key Settings:**
- **Firefox only** — WebGPU support with `dom.webgpu.enabled` pref
- **Headed mode** — WebGPU requires a display (no headless)
- **Auto-start dev server** — `webServer` config starts Vite automatically
- **CommonJS** — `.cjs` extension avoids Node 19 ESM issues

**Browser Installation:**
Playwright downloads its own Firefox binary via `npx playwright install firefox`. This is cached and doesn't need reinstalling unless Playwright is upgraded. If tools report "Executable doesn't exist", it's likely a sandbox/cache isolation issue, not a real need to reinstall.

**Test File Structure:**
```
tests/e2e/
├── playwright.config.cjs  # Playwright configuration
├── smoke.spec.cjs         # Quick smoke test (~5s)
├── helpers.cjs            # Console capture utilities
└── *.spec.cjs             # Additional E2E tests
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
.claude/
test-results/
playwright-report/

# Downloaded assets (fetched at build time via download.sh scripts)
assets/**/*.tif
assets/**/*.tiff
assets/**/*.exr
assets/**/*.jpg
assets/**/*.jpeg
assets/**/*.png
assets/**/*.gltf
assets/**/*.glb
assets/**/*.tmp
# Generated textures (converted at build time)
assets/**/*.ktx2
# Keep committed models explicitly tracked
!assets/models/*.glb
```

Large binary assets are downloaded at build time rather than committed. Generated textures (`.ktx2`) are converted from downloaded assets by `npm run convert-textures`. Each asset folder (e.g., `assets/lunar/`) contains a `download.sh` script and `README.md` with attribution.

---

## Environment Requirements

| Requirement | Minimum | Notes |
|-------------|---------|-------|
| Node.js | 18.x, 20.x, or 22+ | v19 works with warnings |
| Browser | Chrome 113+ / Edge 113+ | WebGPU required |
| npm | 9.x+ | Included with Node |

### Build-Time Tools (for texture conversion)

| Tool | Purpose | Installation |
|------|---------|--------------|
| ImageMagick | TIFF to PNG conversion | `sudo apt install imagemagick` |
| KTX-Software | PNG to KTX2 with mipmaps | See below |

**Installing KTX-Software:**

```bash
# Ubuntu/Debian (if available in repos)
sudo apt install ktx-tools

# Or download from GitHub releases
curl -fsSL -o /tmp/ktx.tar.bz2 \
  "https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Linux-x86_64.tar.bz2"
tar -xjf /tmp/ktx.tar.bz2 -C /tmp
export PATH="/tmp/KTX-Software-4.4.2-Linux-x86_64/bin:$PATH"

# macOS
brew install imagemagick ktx-software
```

These tools are only needed for the `convert-textures` step (converting NASA TIFFs to KTX2). If you already have the `.ktx2` files, these tools are not required.

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
