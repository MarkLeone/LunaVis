#!/usr/bin/env bash
# Discover and run all download.sh scripts in the assets directory
# This is called at build time to fetch external assets

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ASSETS_DIR="$PROJECT_ROOT/assets"

echo "=== Downloading external assets ==="

# Find all download.sh scripts in assets directory
download_scripts=$(find "$ASSETS_DIR" -name "download.sh" -type f 2>/dev/null || true)

if [[ -z "$download_scripts" ]]; then
    echo "No download scripts found in $ASSETS_DIR"
    exit 0
fi

for script in $download_scripts; do
    dir=$(dirname "$script")
    name=$(basename "$dir")
    echo ""
    echo "--- $name ---"
    bash "$script"
done

echo ""
echo "=== All assets downloaded ==="
