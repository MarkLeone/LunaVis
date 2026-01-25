# Build and Test Procedures

Practical guide for building, testing, and developing LunaVis.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18.x, 19.x, 20.x, or 22+ | v19 works with warnings |
| npm | 9.x+ | Included with Node |
| Firefox | Recent | WebGPU must be enabled |
| ImageMagick | Any recent | For texture conversion (TIFF→PNG) |
| KTX-Software | 4.x | For texture conversion (PNG→KTX2) |

### Installing Texture Conversion Tools

```bash
# Ubuntu/Debian
sudo apt install imagemagick

# KTX-Software (download from GitHub)
curl -fsSL -o /tmp/ktx.tar.bz2 \
  "https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Linux-x86_64.tar.bz2"
tar -xjf /tmp/ktx.tar.bz2 -C /tmp
export PATH="/tmp/KTX-Software-4.4.2-Linux-x86_64/bin:$PATH"

# macOS
brew install imagemagick ktx-software
```

> **Note:** These tools are only needed for converting NASA source textures to KTX2. If `.ktx2` files already exist, conversion is skipped.

### Enable WebGPU in Firefox

1. Open Firefox
2. Navigate to `about:config`
3. Search for `dom.webgpu.enabled`
4. Set to `true`
5. Restart Firefox

> **Note:** Chrome has Intel Arc GPU driver issues on Linux hybrid laptops. Use Firefox for development.

## Installation

```bash
cd LunaVis
npm install
npm run download-assets
npm run convert-textures
```

- `download-assets` — fetches large binary assets (textures, elevation maps) from their canonical sources
- `convert-textures` — converts downloaded TIFFs to GPU-ready KTX2 format with mipmaps

These files are not committed to git to keep the repository lightweight.

Expected output includes engine warnings for Node 19 — these are non-fatal.

## Development

### Start Dev Server

```bash
npm run dev
```

Opens Vite dev server at http://localhost:3000 (or next available port).

**Features:**
- Hot Module Replacement (HMR) — changes apply instantly
- TypeScript compilation on-the-fly
- Raw `.wgsl` shader imports

### Verify It Works

1. Open Firefox at http://localhost:3000
2. Canvas should display the Utah Teapot with Blinn-Phong shading
3. FPS counter shows in top-left corner
4. Tweakpane debug UI appears in top-right corner
5. Interact with the model:
   - Click + drag to orbit around the model
   - Scroll to zoom in/out
   - Right-click + drag to pan
6. Use Tweakpane to:
   - Select different models (Utah Teapot, Duck)
   - Adjust light direction, color, intensity
   - Adjust ambient color
   - Adjust material color and shininess
7. Console should show:
   ```
   [LunaVis] Mesh-created
   {"event":"mesh-created","version":"0.1.0","id":"mesh-..."}
   [LunaVis] Ready
   {"event":"ready","version":"0.1.0"}
   [LunaVis] Model-loaded
   {"event":"model-loaded","version":"0.1.0","name":"Utah Teapot",...}
   ```

## Testing

### Unit Tests (Vitest)

Fast, Node-based tests for pure functions and type utilities.

```bash
# Run once
npm run test

# Watch mode (re-runs on file changes)
npm run test:watch
```

**Location:** `tests/*.test.ts`

**What's tested:**
- Type helpers (`ok()`, `err()`, `isOk()`, `isErr()`)
- Branded ID constructors (`meshId()`, `materialId()`)
- Quadtree data structure (`QuadNode`, `QuadTree`)
- Frustum plane extraction and sphere intersection
- LOD selection with screen-space error metric
- NodeData GPU struct packing/unpacking
- Camera auto-framing and OrbitControls sync

### Smoke Test (Playwright + Firefox)

Quick E2E verification that the app starts without errors.

```bash
npm run test:smoke
```

**Target time:** < 10 seconds (typically ~5s)

**What's verified:**
1. Firefox launches with WebGPU enabled
2. Page loads without JavaScript errors
3. `[LunaVis] Ready` marker appears in console
4. Structured event `{"event":"ready",...}` is logged
5. Canvas has non-zero dimensions

**Note:** Opens a visible Firefox window briefly (WebGPU requires headed mode).

### Full E2E Suite (Playwright)

All E2E tests including milestone-specific verifications.

```bash
npm run test:e2e
```

**Location:** `tests/e2e/*.spec.cjs`

### Run All Tests

```bash
npm run test && npm run test:smoke
```

## Build

### Production Build

```bash
npm run build
```

**Steps:**
1. Download external assets (`npm run download-assets`)
2. Convert textures to KTX2 (`npm run convert-textures`)
3. TypeScript type-checking (`tsc`)
4. Vite production build (minified, tree-shaken)

**Output:** `dist/`

### Download Assets Only

```bash
npm run download-assets
```

Discovers and runs all `download.sh` scripts in the `assets/` directory. Each asset folder (e.g., `assets/lunar/`) contains its own download script and README with attribution.

**Current assets:**
- `assets/lunar/` — NASA CGI Moon Kit (color map + displacement map, ~120 MB)

### Convert Textures Only

```bash
npm run convert-textures
```

Converts downloaded source textures to GPU-optimized KTX2 format:
- `lroc_color_16bit_srgb_4k.tif` → `moon_color.ktx2` (8-bit sRGB, 13 mipmaps, Zstd)

The conversion is idempotent — if `.ktx2` files already exist, they are skipped.

**Verification:**
```bash
# Inspect the converted texture
ktx info assets/lunar/moon_color.ktx2

# Extract to PNG for visual inspection
ktx extract assets/lunar/moon_color.ktx2 /tmp/moon.png
```

### Preview Production Build

```bash
npm run preview
```

Serves the `dist/` folder locally to verify the production build.

## Type Checking

```bash
npx tsc --noEmit
```

Runs TypeScript compiler without emitting files — useful for CI or pre-commit checks.

## Common Issues

### KTX Tools Not Found

Error: `Neither 'ktx' nor 'toktx' is installed`

**Solution:** Install KTX-Software (see Prerequisites) or download from GitHub:
```bash
curl -fsSL -o /tmp/ktx.tar.bz2 \
  "https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Linux-x86_64.tar.bz2"
tar -xjf /tmp/ktx.tar.bz2 -C /tmp
export PATH="/tmp/KTX-Software-4.4.2-Linux-x86_64/bin:$PATH"
npm run convert-textures
```

### Port Already in Use

Vite automatically tries the next port (3001, 3002, etc.). Check terminal output for actual URL.

### WebGPU Not Supported

Error: `WebGPU is not supported in this browser`

**Solution:** Use Firefox with `dom.webgpu.enabled: true` in `about:config`.

### Chrome GPU Errors

Error: `VK_ERROR_OUT_OF_DEVICE_MEMORY`

**Cause:** Intel Arc Vulkan driver issues on hybrid GPU laptops.

**Solution:** Use Firefox instead of Chrome for development.

### Playwright ESM Errors

Error: `Playwright requires Node.js 18.19 or higher to load esm modules`

**Solution:** All Playwright files use `.cjs` extension to avoid ESM issues with Node 19.

### Vitest Picks Up E2E Tests

Error: `test.describe() to be called here`

**Solution:** Vitest config excludes `**/e2e/**` directory. Verify `vitest.config.ts` has:
```typescript
exclude: ['**/node_modules/**', '**/e2e/**']
```

## Development Workflow

### Typical Iteration Cycle

1. Start dev server: `npm run dev`
2. Open Firefox at localhost URL
3. Make code changes (HMR applies automatically)
4. Check browser console for errors
5. Run smoke test before committing: `npm run test:smoke`

### Before Committing

```bash
npm run test          # Unit tests pass
npm run test:smoke    # E2E smoke test passes
npx tsc --noEmit      # No type errors
```

> **Note:** Downloaded assets (`.tif`, `.exr`, `.jpg`, `.png` in `assets/`) are gitignored. Only the `download.sh` scripts and `README.md` files are committed.

### Adding New Unit Tests

1. Create `tests/feature.test.ts`
2. Import from `vitest`:
   ```typescript
   import { describe, it, expect } from 'vitest';
   ```
3. Run with `npm run test:watch`

### Adding New E2E Tests

1. Create `tests/e2e/feature.spec.cjs` (must use `.cjs` extension)
2. Use CommonJS requires:
   ```javascript
   const { test, expect } = require('@playwright/test');
   const { captureConsole } = require('./helpers.cjs');
   ```
3. Run with `npm run test:e2e`

## CI Integration (Future)

For GitHub Actions or similar:

```yaml
- run: npm ci
- run: npm run test
- run: npx tsc --noEmit
# E2E requires display, use xvfb-run on Linux:
- run: xvfb-run npm run test:e2e
```

Note: E2E tests require a display for WebGPU. Use `xvfb-run` or similar virtual framebuffer.
