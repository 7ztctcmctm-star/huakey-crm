#!/bin/bash
# Check frontend build output for common issues
set -e
DIST="frontend/dist"
echo "[check-bundle] Verifying build output..."
if [ ! -f "$DIST/index.html" ]; then echo "::error::Missing index.html"; exit 1; fi
if [ ! -d "$DIST/assets" ]; then echo "::error::Missing assets directory"; exit 1; fi
size=$(du -sm "$DIST" | cut -f1)
echo "[check-bundle] OK — build output is ${size}MB"
