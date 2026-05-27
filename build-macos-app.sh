#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$ROOT_DIR/build"
APP_DIR="$ROOT_DIR/dist/我的电脑之家.app"
DESKTOP_APP="$HOME/Desktop/我的电脑之家.app"

# Recreate the bundle from scratch so stale binaries or plist values cannot survive rebuilds.
rm -rf "$BUILD_DIR" "$APP_DIR"
mkdir -p "$BUILD_DIR" "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

# Compile the native shell; the application UI is served by the local WebGL frontend.
swiftc \
  "$ROOT_DIR/native/MyComputerHome/main.swift" \
  -o "$APP_DIR/Contents/MacOS/MyComputerHome" \
  -framework AppKit \
  -framework WebKit

cp "$ROOT_DIR/native/MyComputerHome/Info.plist" "$APP_DIR/Contents/Info.plist"
chmod +x "$APP_DIR/Contents/MacOS/MyComputerHome"

# Mirror the built app to Desktop for manual launch/testing on the current machine.
rm -rf "$DESKTOP_APP"
cp -R "$APP_DIR" "$DESKTOP_APP"

echo "Built: $APP_DIR"
echo "Copied to: $DESKTOP_APP"
