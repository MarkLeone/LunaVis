#!/usr/bin/env bash
# Download lunar map data from NASA Scientific Visualization Studio
# Source: https://svs.gsfc.nasa.gov/4720

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BASE_URL="https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720"

FILES=(
    "lroc_color_16bit_srgb_4k.tif"
    "ldem_16.tif"
)

echo "Downloading lunar assets from NASA SVS..."

for file in "${FILES[@]}"; do
    if [[ -f "$file" ]]; then
        echo "  ✓ $file (already exists)"
    else
        echo "  ↓ Downloading $file..."
        # Download to temp file, rename on success (handles interrupted downloads)
        curl -fSL --progress-bar -o "$file.tmp" "${BASE_URL}/${file}"
        mv "$file.tmp" "$file"
        echo "  ✓ $file"
    fi
done

echo "Done."
