#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$ROOT_DIR/build"
APP_DIR="$ROOT_DIR/dist/我的电脑之家.app"
DESKTOP_APP="$HOME/Desktop/我的电脑之家.app"

# 每次重新打包都清空旧产物，避免把过期的二进制或 Info.plist 带进新 app。
rm -rf "$BUILD_DIR" "$APP_DIR"
mkdir -p "$BUILD_DIR" "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

# 用 Swift 编译一个很薄的 macOS 壳，真实 UI 仍由本地 WebGL 页面提供。
swiftc \
  "$ROOT_DIR/native/MyComputerHome/main.swift" \
  -o "$APP_DIR/Contents/MacOS/MyComputerHome" \
  -framework AppKit \
  -framework WebKit

cp "$ROOT_DIR/native/MyComputerHome/Info.plist" "$APP_DIR/Contents/Info.plist"
chmod +x "$APP_DIR/Contents/MacOS/MyComputerHome"

# 复制到桌面，方便像普通 macOS 应用一样双击启动和面试演示。
rm -rf "$DESKTOP_APP"
cp -R "$APP_DIR" "$DESKTOP_APP"

echo "Built: $APP_DIR"
echo "Copied to: $DESKTOP_APP"
