#!/usr/bin/env bash
# Convert downloaded lunar color texture to KTX2 format with mipmaps
# Requires: ImageMagick (convert), KTX-Software (ktx)
#
# Install dependencies:
#   Ubuntu/Debian: sudo apt install imagemagick ktx-tools
#   macOS: brew install imagemagick ktx-software
#
# Note: Displacement map (ldem_16.tif) is NOT converted here.
# It will be read directly and processed by compute shader for mesh generation.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LUNAR_DIR="$PROJECT_ROOT/assets/lunar"

echo "=== Converting lunar color texture to KTX2 ==="

# Check for required tools
check_tool() {
    if ! command -v "$1" &> /dev/null; then
        echo "Error: $1 is not installed."
        echo "Install with:"
        echo "  Ubuntu/Debian: sudo apt install $2"
        echo "  macOS: brew install $3"
        exit 1
    fi
}

check_tool "convert" "imagemagick" "imagemagick"

# Check for ktx (preferred) or toktx (fallback)
if command -v "ktx" &> /dev/null; then
    KTX_TOOL="ktx"
elif command -v "toktx" &> /dev/null; then
    KTX_TOOL="toktx"
else
    echo "Error: Neither 'ktx' nor 'toktx' is installed."
    echo "Install with:"
    echo "  Ubuntu/Debian: sudo apt install ktx-tools"
    echo "  macOS: brew install ktx-software"
    exit 1
fi

cd "$LUNAR_DIR"

# Convert color map: TIFF → PNG → KTX2 (sRGB, mipmapped, Zstd compressed)
#
# Color space notes:
# - NASA source is 16-bit sRGB TIFF
# - Target is 8-bit sRGB (R8G8B8_SRGB format)
# - 8-bit sRGB is correct for albedo textures:
#   * sRGB encoding provides perceptually uniform precision
#   * GPU converts to linear automatically when sampling
#   * 8-bit sRGB ≈ 12-bit perceptual precision in dark tones
# - 16-bit would be overkill and waste memory/bandwidth

COLOR_TIFF="lroc_color_16bit_srgb_4k.tif"
COLOR_PNG="lroc_color_4k.png"
COLOR_KTX2="moon_color.ktx2"

if [[ -f "$COLOR_KTX2" ]]; then
    echo "  ✓ $COLOR_KTX2 (already exists)"
else
    if [[ ! -f "$COLOR_TIFF" ]]; then
        echo "Error: $COLOR_TIFF not found. Run 'npm run download-assets' first."
        exit 1
    fi
    
    echo "  → Converting $COLOR_TIFF to 8-bit sRGB PNG..."
    # Convert 16-bit TIFF to 8-bit PNG
    # ImageMagick preserves sRGB color space during depth reduction
    convert "$COLOR_TIFF" -depth 8 "$COLOR_PNG"
    
    echo "  → Converting $COLOR_PNG to KTX2 with mipmaps (using $KTX_TOOL)..."
    
    if [[ "$KTX_TOOL" == "ktx" ]]; then
        # ktx create: newer tool with better format control
        # --format R8G8B8_SRGB: 8-bit sRGB (GPU linearizes on sample)
        # --generate-mipmap: create mip chain
        # --mipmap-filter lanczos4: high-quality downsampling
        # --zstd 19: lossless supercompression
        ktx create \
            --format R8G8B8_SRGB \
            --generate-mipmap \
            --mipmap-filter lanczos4 \
            --zstd 19 \
            "$COLOR_PNG" "$COLOR_KTX2"
    else
        # toktx: older tool, fallback
        # --t2: KTX version 2
        # --genmipmap: generate mipmap chain
        # --filter lanczos4: high-quality mipmap filter
        # --zcmp 19: Zstd lossless compression
        # --assign_oetf srgb: mark as sRGB transfer function
        toktx --t2 --genmipmap --filter lanczos4 --zcmp 19 --assign_oetf srgb \
            "$COLOR_KTX2" "$COLOR_PNG"
    fi
    
    # Clean up intermediate PNG
    rm "$COLOR_PNG"
    
    echo "  ✓ $COLOR_KTX2"
fi

echo ""
echo "=== Conversion complete ==="
echo ""
echo "Output: $LUNAR_DIR/$COLOR_KTX2"
echo ""
echo "Note: Displacement map (ldem_16.tif) is kept as TIFF."
echo "      It will be processed directly by compute shader for mesh generation."
