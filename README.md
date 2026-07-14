# 我的电脑之家 / Desktop Home

> 把电脑应用和文件夹映射成 3D 游戏房间物品的本地 macOS 启动器 —— 第一人称探索，准星拾取，游戏内打开真实文件。
>
> A macOS 3D gamified desktop launcher that maps apps and folders into game-room objects — first-person exploration, crosshair pickup, open real files from inside the game.

[![Platform](https://img.shields.io/badge/platform-macOS-blue)](https://www.apple.com/macos/)
[![Three.js](https://img.shields.io/badge/Three.js-3D%20Engine-black)](https://threejs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-Backend-339933)](https://nodejs.org/)
[![Type](https://img.shields.io/badge/type-MVP%20Prototype-orange)]()

---

## 简介 / Overview

这是一个 macOS 上的 3D 游戏化桌面启动器。用 Three.js 构建第一人称 3D 房间，把应用映射成物品、文件夹映射成箱子；后端用 Node.js 扫描本地应用和指定目录；前端支持 WASD 移动、鼠标视角、准星拾取和游戏内打开真实文件。最后用 Swift + WebKit 封装成轻量 macOS 原生壳。

A 3D gamified desktop launcher for macOS. Three.js renders a first-person 3D room where apps become objects and folders become chests. A Node.js backend scans local apps and directories. The frontend supports WASD movement, mouse look, crosshair pickup, and opening real files from inside the game. A Swift + WebKit wrapper packages it as a lightweight native macOS app.

---

## 团队 / Team

| 成员 / Member | 角色 / Role | 职责 / Responsibilities |
|---|---|---|
| Wang Keyu | 项目组织者 / Project Lead | 项目组织与整体架构 / Project organization & architecture |
| Wu Jiaxuan | 项目成员 / Member | 游戏内启动真实应用、调用 macOS 系统能力、Swift + WebKit 原生壳 / In-game app launching, macOS system integration, Swift + WebKit native shell |
| Gong Yongjia | 项目成员 / Member | 本地存档机制、角色位置/视角/链接/布局持久化 / Local save system, position/view/link/layout persistence |

---

## 核心功能 / Key Features

- 🎮 **第一人称 3D 房间 / First-person 3D room** — WASD 移动、鼠标 360° 转向、准星拾取 / WASD movement, 360° mouse look, crosshair pickup
- 📦 **应用 → 3D 物品 / Apps → 3D objects** — 扫描 `/Applications`、`~/Applications` 中的 macOS 应用并映射为房间物品 / Scans macOS apps and maps them to room objects
- 📁 **文件夹 → 3D 箱子 / Folders → 3D chests** — 支持嵌套进入文件夹箱子 / Nestable folder chests
- 🖱️ **游戏内打开真实文件 / Open real files in-game** — 准星对准物品点击，调用系统 `open` 打开真实应用或文件 / Aim crosshair at object, click to open the real app/file via system `open`
- 🏠 **原生 macOS 应用 / Native macOS app** — Swift + WebKit 轻量壳（~128 KB），保持窗口常驻 / Swift + WebKit lightweight shell (~128 KB), persistent window
- 💾 **自动存档 / Auto-save** — 角色位置、视角、物品布局保存在 `data/world.json` / Position, view, and layout saved to `data/world.json`
- 🔍 **搜索 / Search** — 搜索应用、文件和文件夹 / Search apps, files, and folders
- 🎨 **程序化场景 / Procedural scene** — 木地板、墙板、天花梁、窗光、尘粒、暗角 / Wood floor, wall panels, ceiling beams, window light, dust particles, vignette

---

## 安全设计 / Security Design

- 后端 `/api/open` 只允许打开扫描范围内的真实对象，不接受任意路径 / Backend `/api/open` only opens real objects within scan scope, rejects arbitrary paths
- 自定义文件夹入口做路径归一化、去重、存在性检查，限制在用户主目录下 / Custom folder entries are normalized, deduplicated, existence-checked, and restricted to user home directory
- 使用 `execFile("open", [targetPath])` 而非拼接 shell 命令，避免注入风险 / Uses `execFile` instead of shell concatenation to prevent injection
- 打开文件失败时前端展示后端返回的错误 / Frontend shows backend errors on open failure

---

## 快速开始 / Quick Start

### 方式一：开发服务器 / Option 1: Dev server

```bash
node server.js
```

打开 / Open：`http://localhost:4173`

### 方式二：桌面应用 / Option 2: Desktop app

直接打开桌面上的 macOS 应用 / Double-click the desktop app：

```
~/Desktop/我的电脑之家.app
```

重新打包 / Rebuild the app：

```bash
./build-macos-app.sh
```

---

## 文件结构 / File Structure

```
minecraft-desktop-home/
├── server.js               # Node.js 后端：扫描应用/目录、打开文件 / Backend: scan & open
├── public/                 # 前端静态资源 / Frontend static assets
├── native/                 # Swift + WebKit 原生壳源码 / Swift + WebKit shell source
├── build-macos-app.sh      # macOS 应用打包脚本 / macOS app build script
├── data/                   # 本地存档 world.json / Local save data
├── package.json
├── 需求文档.md              # 产品需求文档 / Product requirements doc
└── README.md
```

---

## 当前边界 / Current Limitations

- 这是 WebGL 3D 原型，还不是完整建造游戏 / This is a WebGL 3D prototype, not a full building game
- 只读取和打开文件，不在游戏内删除、移动或重命名真实文件 / Only reads/opens files; no in-game delete/move/rename of real files
- 文件夹扫描深度限制 3 层，单层最多 80 个项目 / Folder scan depth limited to 3 levels, max 80 items per level
- 主要面向 macOS（打开真实对象使用系统 `open` 命令）/ macOS-focused (uses system `open` command)

---

## 技术栈 / Tech Stack

| 层 / Layer | 技术 / Technology |
|---|---|
| 3D 渲染 / 3D Rendering | Three.js（本地引入，断网可用 / local import, works offline） |
| 后端 / Backend | Node.js |
| 原生壳 / Native Shell | Swift + WebKit |
| 存档 / Save Format | JSON (`data/world.json`) |
| 平台 / Platform | macOS |

---

## 许可证 / License

MIT
