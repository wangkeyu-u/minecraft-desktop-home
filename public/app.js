import * as THREE from "./vendor/three.module.js";

const stage = document.querySelector("#stage");
const statusText = document.querySelector("#statusText");
const nearbyList = document.querySelector("#nearbyList");
const selection = document.querySelector("#selection");
const searchInput = document.querySelector("#searchInput");
const saveButton = document.querySelector("#saveButton");
const manageLinksButton = document.querySelector("#manageLinksButton");
const refreshButton = document.querySelector("#refreshButton");
const exitButton = document.querySelector("#exitButton");
const removeSelectedButton = document.querySelector("#removeSelectedButton");
const folderDialog = document.querySelector("#folderDialog");
const folderTitle = document.querySelector("#folderTitle");
const folderPath = document.querySelector("#folderPath");
const folderGrid = document.querySelector("#folderGrid");
const folderBreadcrumbs = document.querySelector("#folderBreadcrumbs");
const closeFolderButton = document.querySelector("#closeFolderButton");
const linksDialog = document.querySelector("#linksDialog");
const linksList = document.querySelector("#linksList");
const closeLinksButton = document.querySelector("#closeLinksButton");
const selectAllAppsButton = document.querySelector("#selectAllAppsButton");
const clearAppsButton = document.querySelector("#clearAppsButton");
const applyLinksButton = document.querySelector("#applyLinksButton");
const settingsDialog = document.querySelector("#settingsDialog");
const closeSettingsButton = document.querySelector("#closeSettingsButton");
const resumeButton = document.querySelector("#resumeButton");
const settingsLinksButton = document.querySelector("#settingsLinksButton");
const settingsExitButton = document.querySelector("#settingsExitButton");
const renameInput = document.querySelector("#renameInput");
const renameButton = document.querySelector("#renameButton");
const folderRootInput = document.querySelector("#folderRootInput");
const addFolderRootButton = document.querySelector("#addFolderRootButton");
const refreshFolderRootsButton = document.querySelector("#refreshFolderRootsButton");
const folderRootsList = document.querySelector("#folderRootsList");
const sidebar = document.querySelector(".sidebar");
const settingsSidebarMount = document.querySelector("#settingsSidebarMount");

const room = { width: 14, height: 10, cell: 1 };
const state = {
  apps: [],
  fileRoots: [],
  items: [],
  world: { player: { x: 6, y: 5 }, yaw: Math.PI, pitch: -0.04, placements: {} },
  selectedId: null,
  hoveredId: null,
  pointerLocked: false,
  pointerDragging: false,
  wasPointerLocked: false,
  keys: new Set(),
  saveTimer: null,
  isSaving: false,
  folderStack: []
};

const defaultVisibleAppCount = 13;
const appSlots = createAppSlots();

const folderSlots = [
  [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7],
  [2, 5], [3, 5], [4, 5]
];

function createAppSlots() {
  const slots = [];
  for (let y = 2; y <= 5; y += 1) {
    for (let x = 2; x <= 11; x += 1) {
      if (y >= 4 && x <= 7) continue;
      slots.push([x, y]);
    }
  }
  slots.push([10, 6], [11, 6], [10, 7], [11, 7]);
  return slots;
}

let scene;
let camera;
let renderer;
let raycaster;
let pointer;
let centerPointer;
let playerGroup;
let floorGroup;
let objectGroup;
let decorGroup;
let atmosphereGroup;
let animationFrameId;
let lastFrameTime = performance.now();
let cameraYaw = Math.PI;
let cameraPitch = -0.04;

const objectMeshes = new Map();
const selectionRings = new Map();
const pickableMeshes = [];
const labelSprites = new Map();

const materials = {
  floor: new THREE.MeshStandardMaterial({
    color: 0x7d5a35,
    roughness: 0.74,
    metalness: 0.02,
    map: createParquetTexture(768, 768),
    bumpMap: createPlankHeightTexture(512, 512),
    bumpScale: 0.045
  }),
  wall: new THREE.MeshStandardMaterial({
    color: 0x846044,
    roughness: 0.72,
    map: createPanelTexture(512, 512),
    bumpMap: createPlankHeightTexture(512, 512),
    bumpScale: 0.025
  }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0x2c342b, roughness: 0.9, map: createNoiseTexture(0x334133, 0x1e271f, 512) }),
  trim: new THREE.MeshStandardMaterial({ color: 0xd8ad6a, roughness: 0.5, metalness: 0.06 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xd2a451, roughness: 0.42, metalness: 0.32 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x22261f, roughness: 0.8 }),
  playerShirt: new THREE.MeshStandardMaterial({ color: 0x3d8f54, roughness: 0.75 }),
  playerFace: new THREE.MeshStandardMaterial({ color: 0xf0bd86, roughness: 0.7 })
};

const moveStep = 0.38;
const eyeHeight = 1.18;

function createNoiseTexture(light, dark, size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const lightColor = new THREE.Color(light);
  const darkColor = new THREE.Color(dark);

  for (let y = 0; y < size; y += 8) {
    for (let x = 0; x < size; x += 8) {
      const mixed = darkColor.clone().lerp(lightColor, 0.35 + Math.random() * 0.45);
      ctx.fillStyle = `#${mixed.getHexString()}`;
      ctx.fillRect(x, y, 8, 8);
    }
  }

  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < size; i += size / 4) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  return texture;
}

function createWoodTexture(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#9b6840");
  gradient.addColorStop(0.55, "#744a2e");
  gradient.addColorStop(1, "#ad7b49");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  for (let y = 18; y < height; y += 34) {
    ctx.strokeStyle = "rgba(48, 29, 14, 0.28)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= width; x += 28) {
      ctx.lineTo(x, y + Math.sin(x * 0.06 + y) * 4);
    }
    ctx.stroke();
  }

  for (let x = 18; x < width; x += 58) {
    ctx.fillStyle = "rgba(35, 20, 9, 0.18)";
    ctx.beginPath();
    ctx.ellipse(x, height * (0.3 + Math.random() * 0.4), 16, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  return texture;
}

function createParquetTexture(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#6e4a2b";
  ctx.fillRect(0, 0, width, height);

  const block = width / 6;
  for (let y = 0; y < height; y += block) {
    for (let x = 0; x < width; x += block) {
      const rotate = ((x + y) / block) % 2 === 0;
      ctx.save();
      ctx.translate(x + block / 2, y + block / 2);
      ctx.rotate(rotate ? 0 : Math.PI / 2);
      for (let i = -2; i <= 2; i += 1) {
        const tone = 42 + ((x * 17 + y * 11 + i * 29) % 36);
        ctx.fillStyle = `rgb(${105 + tone}, ${72 + tone * 0.45}, ${38 + tone * 0.25})`;
        ctx.fillRect(-block / 2, i * block / 5 - block / 12, block, block / 6);
        ctx.strokeStyle = "rgba(34, 18, 8, 0.28)";
        ctx.lineWidth = 2;
        ctx.strokeRect(-block / 2, i * block / 5 - block / 12, block, block / 6);
      }
      ctx.restore();
    }
  }

  ctx.fillStyle = "rgba(255, 230, 170, 0.08)";
  for (let i = 0; i < 80; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    ctx.fillRect(x, y, 2 + Math.random() * 12, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.2, 1.65);
  texture.anisotropy = 8;
  return texture;
}

function createPanelTexture(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const base = ctx.createLinearGradient(0, 0, 0, height);
  base.addColorStop(0, "#9a704f");
  base.addColorStop(0.5, "#725038");
  base.addColorStop(1, "#553924");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  for (let x = 0; x <= width; x += width / 4) {
    ctx.fillStyle = "rgba(30, 17, 8, 0.35)";
    ctx.fillRect(x - 3, 0, 6, height);
    ctx.fillStyle = "rgba(255, 220, 150, 0.16)";
    ctx.fillRect(x + 4, 0, 2, height);
  }

  for (let y = 26; y < height; y += 42) {
    ctx.strokeStyle = "rgba(24, 13, 6, 0.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= width; x += 22) {
      ctx.lineTo(x, y + Math.sin(x * 0.04 + y) * 3);
    }
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.4, 1.1);
  texture.anisotropy = 8;
  return texture;
}

function createPlankHeightTexture(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, width, height);

  for (let x = 0; x < width; x += width / 8) {
    ctx.fillStyle = "#404040";
    ctx.fillRect(x, 0, 4, height);
  }
  for (let y = 0; y < height; y += height / 8) {
    ctx.fillStyle = "rgba(50,50,50,0.55)";
    ctx.fillRect(0, y, width, 3);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

function createDustTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 42);
  gradient.addColorStop(0, "rgba(255, 235, 180, 0.9)");
  gradient.addColorStop(0.35, "rgba(255, 210, 130, 0.32)");
  gradient.addColorStop(1, "rgba(255, 210, 130, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 96, 96);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function gridToWorld(position, y = 0) {
  return new THREE.Vector3(
    (position.x - room.width / 2 + 0.5) * room.cell,
    y,
    (position.y - room.height / 2 + 0.5) * room.cell
  );
}

function iconFor(item) {
  if (item.type === "folder") return "箱";
  if (item.appearance === "portal") return "门";
  if (item.appearance === "record") return "音";
  if (item.appearance === "console") return "令";
  if (item.appearance === "book") return "书";
  if (item.appearance === "frame") return "图";
  if (item.appearance === "code") return "码";
  if (item.appearance === "crate") return "包";
  return "物";
}

function normalizeWorld(world) {
  return {
    player: world?.player || { x: 6, y: 5 },
    yaw: Number.isFinite(world?.yaw) ? world.yaw : Math.PI,
    pitch: Number.isFinite(world?.pitch) ? world.pitch : -0.04,
    enabledAppIds: Array.isArray(world?.enabledAppIds) ? world.enabledAppIds : null,
    customFolderPaths: normalizeFolderPaths(world?.customFolderPaths),
    customNames: world?.customNames && typeof world.customNames === "object" ? world.customNames : {},
    placements: world?.placements || {}
  };
}

function normalizeFolderPaths(paths) {
  if (!Array.isArray(paths)) return [];
  return Array.from(new Set(
    paths
      .filter((folderPath) => typeof folderPath === "string")
      .map((folderPath) => folderPath.trim())
      .filter(Boolean)
  ));
}

async function bootstrap() {
  mountSidebarInSettings();
  statusText.textContent = "正在扫描应用和文件夹...";
  const response = await fetch("/api/bootstrap");
  const data = await response.json();

  state.apps = data.apps || [];
  state.fileRoots = data.fileRoots || [];
  state.world = normalizeWorld(data.world);
  cleanupWorldForInstalledApps();
  cameraYaw = state.world.yaw;
  cameraPitch = state.world.pitch;
  buildItems();
  initThree();
  renderSceneObjects();
  updatePlayerPosition();
  renderNearby();
  renderSelection();
  renderFolderRootsPanel();
  statusText.textContent = `已载入 ${state.apps.length} 个应用和 ${state.fileRoots.length} 个文件入口。`;
  document.body.classList.remove("ui-open");
  setNativeCursorHidden(true);
  scheduleAutoSave();
}

function cleanupWorldForInstalledApps() {
  const installedAppIds = new Set(state.apps.map((app) => app.id));
  const enabled = getEnabledAppIds();
  const cleanedEnabled = Array.from(enabled).filter((id) => installedAppIds.has(id));
  state.world.enabledAppIds = cleanedEnabled;

  const allowedIds = new Set([
    ...cleanedEnabled,
    ...state.fileRoots.map((folder) => folder.id)
  ]);

  state.world.customNames = Object.fromEntries(
    Object.entries(state.world.customNames || {}).filter(([id]) => allowedIds.has(id))
  );
  state.world.placements = Object.fromEntries(
    Object.entries(state.world.placements || {}).filter(([id]) => allowedIds.has(id))
  );
}

function mountSidebarInSettings() {
  if (sidebar && settingsSidebarMount && sidebar.parentElement !== settingsSidebarMount) {
    settingsSidebarMount.appendChild(sidebar);
  }
}

function setNativeCursorHidden(hidden) {
  window.webkit?.messageHandlers?.nativeCursor?.postMessage(Boolean(hidden));
}

function buildItems() {
  const enabledAppIds = getEnabledAppIds();
  const appItems = state.apps.filter((app) => enabledAppIds.has(app.id)).map((app, index) => ({
    ...app,
    originalName: app.name,
    name: displayNameFor(app),
    position: state.world.placements[app.id] || slotPosition(index)
  }));

  const folderItems = state.fileRoots.slice(0, folderSlots.length).map((folder, index) => ({
    ...folder,
    appearance: "chest",
    position: state.world.placements[folder.id] || { x: folderSlots[index][0], y: folderSlots[index][1] }
  }));

  state.items = [...appItems, ...folderItems];
}

function displayNameFor(item) {
  return state.world.customNames?.[item.id] || item.name;
}

function getEnabledAppIds() {
  if (Array.isArray(state.world.enabledAppIds)) {
    return new Set(state.world.enabledAppIds);
  }
  return new Set(state.apps.slice(0, defaultVisibleAppCount).map((app) => app.id));
}

function slotPosition(index) {
  const slot = appSlots[index % appSlots.length];
  const loop = Math.floor(index / appSlots.length);
  return {
    x: clamp(slot[0] + (loop % 2 === 0 ? 0 : 0.24), 1, room.width - 2),
    y: clamp(slot[1] + loop * 0.18, 1, room.height - 2)
  };
}

function initThree() {
  if (renderer) {
    return;
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x151d16);
  scene.fog = new THREE.Fog(0x151d16, 7.5, 18);

  camera = new THREE.PerspectiveCamera(68, 1, 0.08, 80);
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.className = "three-canvas";
  stage.appendChild(renderer.domElement);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  centerPointer = new THREE.Vector2(0, 0);
  floorGroup = new THREE.Group();
  objectGroup = new THREE.Group();
  decorGroup = new THREE.Group();
  atmosphereGroup = new THREE.Group();
  scene.add(floorGroup, objectGroup, decorGroup, atmosphereGroup);

  addLights();
  buildRoom();
  buildPlayer();
  resizeRenderer();
  renderer.shadowMap.needsUpdate = true;
  window.addEventListener("resize", resizeRenderer);
  renderer.domElement.addEventListener("click", handleCanvasClick);
  renderer.domElement.addEventListener("pointerdown", handlePointerDown);
  window.addEventListener("pointerup", handlePointerUp);
  renderer.domElement.addEventListener("pointermove", handlePointerMove);
  document.addEventListener("pointerlockchange", handlePointerLockChange);
  document.addEventListener("mousemove", handleMouseLook);
  animate();
}

function addLights() {
  const ambient = new THREE.HemisphereLight(0xf8edd4, 0x263d2b, 0.92);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffe2ad, 2.65);
  sun.position.set(-3.8, 7.5, 4.6);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  scene.add(sun);

  const warmLamp = new THREE.PointLight(0xffb36b, 18, 12);
  warmLamp.position.set(-5.2, 2.2, -3.6);
  scene.add(warmLamp);

  const deskGlow = new THREE.PointLight(0x85d6ff, 5.5, 7);
  deskGlow.position.set(4.6, 1.65, -2.2);
  scene.add(deskGlow);

  const ceilingGlow = new THREE.PointLight(0xffd69a, 6.5, 10);
  ceilingGlow.position.set(0, 2.55, 0.2);
  scene.add(ceilingGlow);
}

function buildRoom() {
  floorGroup.clear();
  decorGroup?.clear();
  atmosphereGroup?.clear();

  const floor = new THREE.Mesh(new THREE.BoxGeometry(room.width, 0.16, room.height), materials.floor);
  floor.position.set(0, -0.08, 0);
  floor.receiveShadow = true;
  floorGroup.add(floor);

  const borderMaterial = new THREE.MeshStandardMaterial({ color: 0x2f2014, roughness: 0.76, metalness: 0.03 });
  const borderNorth = new THREE.Mesh(new THREE.BoxGeometry(room.width, 0.035, 0.08), borderMaterial);
  borderNorth.position.set(0, 0.015, -room.height / 2 + 0.55);
  const borderSouth = borderNorth.clone();
  borderSouth.position.z = room.height / 2 - 0.55;
  const borderWest = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, room.height), borderMaterial);
  borderWest.position.set(-room.width / 2 + 0.55, 0.016, 0);
  const borderEast = borderWest.clone();
  borderEast.position.x = room.width / 2 - 0.55;
  floorGroup.add(borderNorth, borderSouth, borderWest, borderEast);

  const wallHeight = 2.7;
  const wallThickness = 0.35;
  const backWall = makeWall(room.width + wallThickness, wallHeight, wallThickness);
  backWall.position.set(0, wallHeight / 2, -room.height / 2 - wallThickness / 2);

  const frontWall = makeWall(room.width + wallThickness, 1.05, wallThickness);
  frontWall.position.set(0, 0.525, room.height / 2 + wallThickness / 2);

  const leftWall = makeWall(wallThickness, wallHeight, room.height + wallThickness);
  leftWall.position.set(-room.width / 2 - wallThickness / 2, wallHeight / 2, 0);

  const rightWall = makeWall(wallThickness, wallHeight, room.height + wallThickness);
  rightWall.position.set(room.width / 2 + wallThickness / 2, wallHeight / 2, 0);

  floorGroup.add(backWall, frontWall, leftWall, rightWall);
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(room.width + 0.35, 0.22, room.height + 0.35), materials.ceiling);
  ceiling.position.set(0, wallHeight + 0.07, 0);
  ceiling.receiveShadow = true;
  floorGroup.add(ceiling);

  addRoomTrim(wallHeight);
  addRoomDetails();
  addAtmosphere();
}

function makeWall(width, height, depth) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials.wall);
  wall.castShadow = true;
  wall.receiveShadow = true;
  return wall;
}

function addRoomTrim(wallHeight) {
  const trimHeight = 0.08;
  const trimDepth = 0.08;
  const backTop = new THREE.Mesh(new THREE.BoxGeometry(room.width + 0.45, trimHeight, trimDepth), materials.trim);
  backTop.position.set(0, wallHeight - 0.28, -room.height / 2 - 0.01);
  const backLow = backTop.clone();
  backLow.position.y = 0.78;

  const leftTop = new THREE.Mesh(new THREE.BoxGeometry(trimDepth, trimHeight, room.height + 0.45), materials.trim);
  leftTop.position.set(-room.width / 2 - 0.01, wallHeight - 0.28, 0);
  const rightTop = leftTop.clone();
  rightTop.position.x = room.width / 2 + 0.01;
  const leftLow = leftTop.clone();
  leftLow.position.y = 0.78;
  const rightLow = rightTop.clone();
  rightLow.position.y = 0.78;

  for (const trim of [backTop, backLow, leftTop, rightTop, leftLow, rightLow]) {
    trim.castShadow = true;
    trim.receiveShadow = true;
    decorGroup.add(trim);
  }
}

function addRoomDetails() {
  const rugMaterial = new THREE.MeshStandardMaterial({
    color: 0x355646,
    roughness: 0.96,
    map: createNoiseTexture(0x496c59, 0x2c4438, 256),
    bumpMap: createNoiseTexture(0x8a8a8a, 0x4b4b4b, 128),
    bumpScale: 0.018
  });
  const rug = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.035, 2.1), rugMaterial);
  rug.position.set(0.2, 0.03, 1.1);
  rug.receiveShadow = true;
  decorGroup.add(rug);

  const shelfMaterial = new THREE.MeshStandardMaterial({ color: 0x6d4627, roughness: 0.72, map: createWoodTexture(128, 128) });
  for (let i = 0; i < 3; i += 1) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.12, 0.28), shelfMaterial);
    shelf.position.set(-4.65 + i * 2.5, 1.38, -5.08);
    shelf.castShadow = true;
    shelf.receiveShadow = true;
    decorGroup.add(shelf);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.045, 0.06), materials.brass);
    rail.position.set(shelf.position.x, 1.49, -4.91);
    rail.castShadow = true;
    decorGroup.add(rail);
  }

  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.36, 24), new THREE.MeshStandardMaterial({ color: 0x5b3b24, roughness: 0.65 }));
  lampBase.position.set(-5.5, 0.18, -3.8);
  const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.48, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0xf0c477, roughness: 0.8, emissive: 0x6a3d12, emissiveIntensity: 0.18 }));
  lampShade.position.set(-5.5, 0.72, -3.8);
  lampBase.castShadow = true;
  lampShade.castShadow = true;
  decorGroup.add(lampBase, lampShade);

  addCeilingBeams();
  addWindowAndLight();
  addWallFrames();
  addWorkTable();
}

function addCeilingBeams() {
  const beamMaterial = new THREE.MeshStandardMaterial({ color: 0x3f2a19, roughness: 0.76, map: createWoodTexture(128, 128) });
  for (let z = -3.8; z <= 4; z += 2.1) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(room.width + 0.7, 0.18, 0.16), beamMaterial);
    beam.position.set(0, 2.62, z);
    beam.castShadow = true;
    beam.receiveShadow = true;
    decorGroup.add(beam);
  }
  for (let x = -5.8; x <= 5.8; x += 2.9) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, room.height + 0.65), beamMaterial);
    beam.position.set(x, 2.5, 0);
    beam.castShadow = true;
    beam.receiveShadow = true;
    decorGroup.add(beam);
  }
}

function addWindowAndLight() {
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x9fd5ff,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.38,
    emissive: 0x1b6a9c,
    emissiveIntensity: 0.2
  });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x2e1d12, roughness: 0.62, metalness: 0.05 });
  const windowGroup = new THREE.Group();
  const pane = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.05, 0.035), glassMaterial);
  pane.position.set(3.8, 1.72, -5.02);
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.08, 0.08), frameMaterial);
  frameTop.position.set(3.8, 2.28, -4.98);
  const frameBottom = frameTop.clone();
  frameBottom.position.y = 1.16;
  const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.18, 0.08), frameMaterial);
  frameLeft.position.set(2.58, 1.72, -4.98);
  const frameRight = frameLeft.clone();
  frameRight.position.x = 5.02;
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.06, 0.09), frameMaterial);
  crossV.position.set(3.8, 1.72, -4.95);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.055, 0.09), frameMaterial);
  crossH.position.set(3.8, 1.72, -4.94);
  windowGroup.add(pane, frameTop, frameBottom, frameLeft, frameRight, crossV, crossH);
  decorGroup.add(windowGroup);

  const beamMaterial = new THREE.MeshBasicMaterial({
    color: 0xd8f2ff,
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  for (let i = 0; i < 3; i += 1) {
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 5.2), beamMaterial);
    beam.position.set(3.35 + i * 0.42, 1.32, -2.65 + i * 0.35);
    beam.rotation.x = -0.72;
    beam.rotation.z = 0.1 + i * 0.05;
    decorGroup.add(beam);
  }
}

function addWallFrames() {
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x322116, roughness: 0.68, metalness: 0.08 });
  const artMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x496c59, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x7b5d9d, roughness: 0.78 }),
    new THREE.MeshStandardMaterial({ color: 0xb78749, roughness: 0.76 })
  ];
  for (let i = 0; i < 3; i += 1) {
    const x = -5.2 + i * 1.25;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.58, 0.07), frameMaterial);
    frame.position.set(x, 1.86, -4.96);
    const art = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.08), artMaterials[i]);
    art.position.set(x, 1.86, -4.91);
    frame.castShadow = true;
    art.castShadow = true;
    decorGroup.add(frame, art);
  }
}

function addWorkTable() {
  const tableMaterial = new THREE.MeshStandardMaterial({ color: 0x56351f, roughness: 0.7, map: createWoodTexture(128, 128) });
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, 0.85), tableMaterial);
  top.position.set(4.6, 0.76, -3.25);
  top.castShadow = true;
  top.receiveShadow = true;
  decorGroup.add(top);
  for (const x of [3.45, 5.75]) {
    for (const z of [-3.58, -2.92]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.12), tableMaterial);
      leg.position.set(x, 0.38, z);
      leg.castShadow = true;
      decorGroup.add(leg);
    }
  }
}

function addAtmosphere() {
  const dustTexture = createDustTexture();
  const dustMaterial = new THREE.SpriteMaterial({
    map: dustTexture,
    transparent: true,
    opacity: 0.16,
    depthWrite: false
  });

  for (let i = 0; i < 90; i += 1) {
    const dust = new THREE.Sprite(dustMaterial);
    dust.position.set(
      -6 + Math.random() * 12,
      0.85 + Math.random() * 1.55,
      -4.4 + Math.random() * 8.4
    );
    const scale = 0.025 + Math.random() * 0.07;
    dust.scale.set(scale, scale, 1);
    dust.userData.floatSpeed = 0.25 + Math.random() * 0.7;
    dust.userData.floatOffset = Math.random() * Math.PI * 2;
    atmosphereGroup.add(dust);
  }
}

function buildPlayer() {
  playerGroup = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.68, 0.34), materials.playerShirt);
  body.position.y = 0.54;
  body.castShadow = true;

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.34, 0.38), materials.playerFace);
  head.position.y = 1.05;
  head.castShadow = true;

  const hair = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.1, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x3b281c, roughness: 0.8 })
  );
  hair.position.y = 1.25;
  hair.castShadow = true;

  playerGroup.add(body, head, hair);
  playerGroup.visible = false;
  scene.add(playerGroup);
}

function resizeRenderer() {
  const rect = stage.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}

function renderSceneObjects() {
  objectGroup.clear();
  objectMeshes.clear();
  selectionRings.clear();
  labelSprites.clear();
  pickableMeshes.length = 0;

  for (const item of state.items) {
    const group = createItemGroup(item);
    group.position.copy(gridToWorld(item.position, 0));
    objectGroup.add(group);
    objectMeshes.set(item.id, group);
  }

  updateItemStates();
  if (renderer) {
    renderer.shadowMap.needsUpdate = true;
  }
}

function createItemGroup(item) {
  const group = new THREE.Group();
  group.userData.itemId = item.id;

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.5, 0.08, 32),
    new THREE.MeshStandardMaterial({
      color: item.type === "folder" ? 0x533620 : 0x273322,
      roughness: 0.84,
      metalness: 0.04
    })
  );
  plinth.position.y = 0.04;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.018, 8, 56),
    new THREE.MeshBasicMaterial({
      color: 0xffd66f,
      transparent: true,
      opacity: 0,
      depthWrite: false
    })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.085;
  ring.renderOrder = 5;
  selectionRings.set(item.id, ring);
  group.add(ring);

  const base = createItemBody(item);
  registerPickable(base, item.id);
  group.add(base);

  const mark = createItemMark(item);
  mark.position.set(0, 0.76, 0);
  mark.userData.itemId = item.id;
  pickableMeshes.push(mark);
  group.add(mark);

  const label = createLabelSprite(item.name);
  label.position.set(0, 1.28, 0);
  labelSprites.set(item.id, label);
  group.add(label);

  if (item.appearance === "portal" || item.appearance === "console") {
    const glow = new THREE.PointLight(item.appearance === "portal" ? 0x6375ff : 0x65e69a, 1.8, 2.8);
    glow.position.set(0, 0.8, 0);
    group.add(glow);
  }

  return group;
}

function registerPickable(object, itemId) {
  object.traverse((child) => {
    child.userData.itemId = itemId;
    if (child.isMesh || child.isSprite) {
      child.castShadow = Boolean(child.isMesh);
      child.receiveShadow = Boolean(child.isMesh);
      pickableMeshes.push(child);
    }
  });
}

function createItemBody(item) {
  if (item.type === "folder" || item.appearance === "chest") {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x9d6b35, roughness: 0.72, map: createWoodTexture(128, 128) });
    const band = new THREE.MeshStandardMaterial({ color: 0x3b2d1e, roughness: 0.58, metalness: 0.12 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.42, 0.58), wood);
    body.position.y = 0.25;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.16, 0.62), wood);
    lid.position.y = 0.56;
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.055), band);
    lock.position.set(0, 0.42, 0.32);
    const strapLeft = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.48, 0.65), band);
    strapLeft.position.set(-0.24, 0.34, 0);
    const strapRight = strapLeft.clone();
    strapRight.position.x = 0.24;
    group.add(body, lid, lock, strapLeft, strapRight);
    return group;
  }

  if (item.appearance === "portal") {
    const group = new THREE.Group();
    const portal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.36, 0.16, 32),
      new THREE.MeshStandardMaterial({
        color: 0x516dff,
        emissive: 0x2836b9,
        emissiveIntensity: 0.9,
        roughness: 0.35
      })
    );
    portal.rotation.x = Math.PI / 2;
    portal.position.y = 0.45;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.045, 12, 40),
      new THREE.MeshStandardMaterial({ color: 0x2c2659, roughness: 0.42, metalness: 0.2, emissive: 0x17114a, emissiveIntensity: 0.5 })
    );
    ring.position.y = 0.45;
    ring.rotation.x = Math.PI / 2;
    group.add(portal, ring);
    return group;
  }

  const colorByAppearance = {
    record: 0x191d1c,
    console: 0x2d8b59,
    book: 0x4a7ed8,
    frame: 0xc69b58,
    code: 0x62b875,
    crate: 0x8c5c31,
    paper: 0xe7d79e,
    artifact: 0xd7c16c
  };

  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.58, 0.58, 2, 2, 2),
    new THREE.MeshStandardMaterial({
      color: colorByAppearance[item.appearance] || colorByAppearance.artifact,
      roughness: 0.62,
      metalness: item.appearance === "console" ? 0.08 : 0
    })
  );
  mesh.position.y = 0.36;
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.045, 0.48),
    new THREE.MeshStandardMaterial({ color: 0xffe7a5, roughness: 0.72, transparent: true, opacity: 0.58 })
  );
  cap.position.y = 0.68;
  group.add(mesh, cap);
  return group;
}

function createItemMark(item) {
  const texture = createTextTexture(iconFor(item), {
    width: 128,
    height: 128,
    font: "bold 64px sans-serif",
    background: "rgba(246, 225, 158, 0.96)",
    color: "#24180d"
  });
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.42, 0.42, 1);
  return sprite;
}

function createLabelSprite(text) {
  const texture = createTextTexture(text, {
    width: 512,
    height: 128,
    font: "bold 38px sans-serif",
    background: "rgba(14, 18, 12, 0.88)",
    color: "#f4f0df"
  });
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.18, 0.26, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function createTextTexture(text, options) {
  const canvas = document.createElement("canvas");
  canvas.width = options.width;
  canvas.height = options.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = options.background;
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 18);
  ctx.fill();
  ctx.fillStyle = options.color;
  ctx.font = options.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const clipped = clipText(ctx, text, canvas.width - 36);
  ctx.fillText(clipped, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function clipText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}...`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}...`;
}

function updatePlayerPosition() {
  const playerWorld = gridToWorld(state.world.player, 0);
  if (playerGroup) {
    playerGroup.position.copy(playerWorld);
  }
  updateCameraFromPlayer();
}

function updateCameraFromPlayer() {
  if (!camera) return;
  const playerWorld = gridToWorld(state.world.player, eyeHeight);
  cameraYaw += angleDelta(cameraYaw, state.world.yaw) * 0.22;
  cameraPitch += (state.world.pitch - cameraPitch) * 0.24;
  const forward = getForwardVector(cameraYaw, cameraPitch);
  camera.position.copy(playerWorld);
  camera.lookAt(playerWorld.clone().add(forward));
}

function angleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function getForwardVector(yaw = state.world.yaw, pitch = state.world.pitch) {
  const cosPitch = Math.cos(pitch);
  return new THREE.Vector3(
    Math.sin(yaw) * cosPitch,
    Math.sin(pitch),
    Math.cos(yaw) * cosPitch
  ).normalize();
}

function getPlanarForward() {
  return new THREE.Vector2(Math.sin(state.world.yaw), Math.cos(state.world.yaw)).normalize();
}

function pickCenteredItem() {
  if (!raycaster || !camera) return null;
  raycaster.setFromCamera(centerPointer, camera);
  const hits = raycaster.intersectObjects(pickableMeshes, false);
  const hit = hits.find((entry) => entry.object.userData.itemId && entry.distance <= 3.2);
  if (!hit) return null;
  return state.items.find((item) => item.id === hit.object.userData.itemId) || null;
}

function updateItemStates() {
  const nearIds = new Set(getNearbyItems().map((item) => item.id));

  for (const item of state.items) {
    const group = objectMeshes.get(item.id);
    const label = labelSprites.get(item.id);
    const ring = selectionRings.get(item.id);
    if (!group || !label) continue;

    const isSelected = item.id === state.selectedId;
    const isHovered = item.id === state.hoveredId;
    const isNear = nearIds.has(item.id);
    group.scale.setScalar(isSelected || isHovered ? 1.13 : 1);
    label.visible = true;
    if (ring) {
      ring.material.opacity = isSelected ? 0.95 : isHovered || isNear ? 0.42 : 0;
    }
  }
}

function animate() {
  animationFrameId = requestAnimationFrame(animate);
  const now = performance.now();
  const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;
  updateHeldControls(deltaSeconds);
  updateCameraFromPlayer();
  const time = performance.now() * 0.001;

  if (atmosphereGroup) {
    for (const dust of atmosphereGroup.children) {
      dust.position.y += Math.sin(time * dust.userData.floatSpeed + dust.userData.floatOffset) * 0.0009;
      dust.material.rotation += 0.0015;
    }
  }

  for (const [itemId, ring] of selectionRings) {
    if (ring.material.opacity > 0) {
      const pulse = 1 + Math.sin(time * 3.2 + itemId.length) * 0.045;
      ring.scale.setScalar(pulse);
    }
  }

  renderer.render(scene, camera);
}

function pointerFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function pickItem(event) {
  pointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickableMeshes, false);
  const hit = hits.find((entry) => entry.object.userData.itemId);
  if (!hit) return null;
  return state.items.find((item) => item.id === hit.object.userData.itemId) || null;
}

function handleCanvasClick(event) {
  const item = pickCenteredItem();
  if (item) {
    selectAndOpen(item);
    return;
  }
}

function handlePointerDown(event) {
  if (event.button !== 0 || !canUseGameControls()) return;
  stage.focus?.();
}

function handlePointerUp() {
  state.pointerDragging = false;
}

function handlePointerMove(event) {
  if (state.pointerLocked) return;
  if (canUseGameControls() && (event.movementX || event.movementY)) {
    turnPlayer(-event.movementX * 0.0028, -event.movementY * 0.0019);
  }
  const item = pickItem(event);
  const nextHoveredId = item?.id || null;
  if (nextHoveredId === state.hoveredId) return;
  state.hoveredId = nextHoveredId;
  updateItemStates();
}

function handlePointerLockChange() {
  const previouslyLocked = state.pointerLocked;
  state.pointerLocked = document.pointerLockElement === renderer.domElement;
  stage.classList.toggle("is-pointer-locked", state.pointerLocked);
  if (previouslyLocked && !state.pointerLocked && !settingsDialog.open && !folderDialog.open && !linksDialog.open) {
    openSettingsDialog();
  }
}

function handleMouseLook(event) {
  if (!state.pointerLocked || folderDialog.open) return;
  turnPlayer(-event.movementX * 0.0022, -event.movementY * 0.0016);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getNearbyItems() {
  return state.items
    .map((item) => ({
      item,
      distance: Math.abs(item.position.x - state.world.player.x) + Math.abs(item.position.y - state.world.player.y)
    }))
    .filter(({ distance }) => distance <= 2)
    .sort((a, b) => a.distance - b.distance)
    .map(({ item }) => item);
}

function renderNearby() {
  const term = searchInput.value.trim().toLowerCase();
  const source = term
    ? state.items.filter((item) => item.name.toLowerCase().includes(term) || item.path.toLowerCase().includes(term))
    : getNearbyItems();

  nearbyList.innerHTML = "";
  if (!source.length) {
    nearbyList.innerHTML = `<div class="nearby-item">没有找到物品。</div>`;
    return;
  }

  for (const item of source.slice(0, 14)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nearby-item";
    button.innerHTML = `<strong>${escapeHtml(item.name)}</strong><span>${item.type === "folder" ? "箱子" : item.type === "app" ? "应用" : "文件"}</span>`;
    button.addEventListener("click", () => {
      state.selectedId = item.id;
      moveNearItem(item);
      updatePlayerPosition();
      renderNearby();
      renderSelection();
      updateItemStates();
    });
    nearbyList.appendChild(button);
  }
}

function selectedApp() {
  const centered = pickCenteredItem();
  const selected = state.items.find((item) => item.id === state.selectedId);
  const candidate = centered || selected;
  return candidate?.type === "app" ? candidate : null;
}

function openSettingsDialog() {
  if (settingsDialog.open) return;
  state.keys.clear();
  document.body.classList.add("ui-open");
  setNativeCursorHidden(false);
  if (document.pointerLockElement === renderer?.domElement) {
    document.exitPointerLock?.();
  }
  const app = selectedApp();
  renameInput.value = app ? app.name : "";
  renameInput.disabled = !app;
  renameButton.disabled = !app;
  renderFolderRootsPanel();
  settingsDialog.showModal();
}

function closeSettingsDialog() {
  settingsDialog.close();
  document.body.classList.remove("ui-open");
  setNativeCursorHidden(true);
  stage.focus?.();
}

function moveNearItem(item) {
  const offsetY = item.position.y > room.height / 2 ? -1.35 : 1.35;
  state.world.player = {
    x: clamp(item.position.x, 0.75, room.width - 1.75),
    y: clamp(item.position.y + offsetY, 0.75, room.height - 1.75)
  };
  lookAtItem(item);
  scheduleAutoSave();
}

function lookAtItem(item) {
  const from = gridToWorld(state.world.player, eyeHeight);
  const to = gridToWorld(item.position, 0.72);
  const direction = to.sub(from).normalize();
  state.world.yaw = Math.atan2(direction.x, direction.z);
  state.world.pitch = clamp(Math.asin(direction.y), -0.78, 0.46);
}

function renderSelection() {
  const selected = state.items.find((item) => item.id === state.selectedId);
  if (!selected) {
    selection.textContent = "移动到物品旁边，或直接点击房间里的物品。";
    removeSelectedButton.disabled = true;
    return;
  }

  removeSelectedButton.disabled = selected.type !== "app";
  selection.innerHTML = `
    <strong>${escapeHtml(selected.name)}</strong><br>
    ${selected.type === "folder" ? "这是一个文件夹箱子。" : selected.type === "app" ? "这是一个真实应用入口。" : "这是一个文件入口。"}<br>
    <span>${escapeHtml(selected.path)}</span>
  `;
}

function movePlayer(forwardAmount, strafeAmount) {
  if (!forwardAmount && !strafeAmount) return;
  const forward = getPlanarForward();
  const right = new THREE.Vector2(-forward.y, forward.x);
  const length = Math.hypot(forwardAmount, strafeAmount) || 1;
  const normalizedForward = forwardAmount / length;
  const normalizedStrafe = strafeAmount / length;
  const nextX = state.world.player.x + (forward.x * normalizedForward + right.x * normalizedStrafe) * moveStep;
  const nextY = state.world.player.y + (forward.y * normalizedForward + right.y * normalizedStrafe) * moveStep;

  state.world.player = {
    x: clamp(nextX, 0.75, room.width - 1.75),
    y: clamp(nextY, 0.75, room.height - 1.75)
  };

  const nearby = pickCenteredItem() || getNearbyItems()[0];
  state.selectedId = nearby?.id || null;
  updatePlayerPosition();
  renderNearby();
  renderSelection();
  updateItemStates();
  scheduleAutoSave();
}

function turnPlayer(deltaYaw, deltaPitch = 0) {
  state.world.yaw += deltaYaw;
  state.world.pitch = clamp(state.world.pitch + deltaPitch, -0.78, 0.46);
  const centered = pickCenteredItem();
  if (centered) state.selectedId = centered.id;
  updatePlayerPosition();
  renderSelection();
  updateItemStates();
  scheduleAutoSave();
}

function updateHeldControls(deltaSeconds) {
  if (!canUseGameControls()) return;

  const speed = 2.8;
  const forwardAmount = (state.keys.has("w") ? 1 : 0) - (state.keys.has("s") ? 1 : 0);
  const strafeAmount = (state.keys.has("d") ? 1 : 0) - (state.keys.has("a") ? 1 : 0);
  if (forwardAmount || strafeAmount) {
    const forward = getPlanarForward();
    const right = new THREE.Vector2(-forward.y, forward.x);
    const length = Math.hypot(forwardAmount, strafeAmount) || 1;
    const travel = speed * deltaSeconds;
    const nextX = state.world.player.x + (forward.x * forwardAmount / length + right.x * strafeAmount / length) * travel;
    const nextY = state.world.player.y + (forward.y * forwardAmount / length + right.y * strafeAmount / length) * travel;
    state.world.player = {
      x: clamp(nextX, 0.75, room.width - 1.75),
      y: clamp(nextY, 0.75, room.height - 1.75)
    };
    const nearby = pickCenteredItem() || getNearbyItems()[0];
    state.selectedId = nearby?.id || null;
    updatePlayerPosition();
    renderNearby();
    renderSelection();
    updateItemStates();
    scheduleAutoSave();
  }

  const turnSpeed = 2.35;
  const pitchSpeed = 1.3;
  const yawDelta = ((state.keys.has("arrowleft") || state.keys.has("q") ? 1 : 0) - (state.keys.has("arrowright") || state.keys.has("e") ? 1 : 0)) * turnSpeed * deltaSeconds;
  const pitchDelta = ((state.keys.has("arrowup") ? 1 : 0) - (state.keys.has("arrowdown") ? 1 : 0)) * pitchSpeed * deltaSeconds;
  if (yawDelta || pitchDelta) {
    turnPlayer(yawDelta, pitchDelta);
  }
}

function canUseGameControls() {
  return !folderDialog.open && !linksDialog.open && !settingsDialog.open && !isTextInputFocused();
}

function isTextInputFocused() {
  const active = document.activeElement;
  return active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);
}

function openSelected() {
  const selected = pickCenteredItem() || state.items.find((item) => item.id === state.selectedId) || getNearbyItems()[0];
  if (selected) selectAndOpen(selected);
}

async function selectAndOpen(item) {
  state.selectedId = item.id;
  renderNearby();
  renderSelection();
  updateItemStates();

  if (item.type === "folder") {
    openFolder(item);
    return;
  }

  await openSystemTarget(item);
}

function openFolder(folder) {
  document.body.classList.add("ui-open");
  setNativeCursorHidden(false);
  state.folderStack = [folder];
  renderFolder();
  folderDialog.showModal();
}

function renderFolder() {
  const current = state.folderStack.at(-1);
  folderTitle.textContent = current.name;
  folderPath.textContent = current.path;
  folderGrid.innerHTML = "";
  folderBreadcrumbs.innerHTML = "";

  state.folderStack.forEach((folder, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = folder.name || "根目录";
    button.addEventListener("click", () => {
      state.folderStack = state.folderStack.slice(0, index + 1);
      renderFolder();
    });
    folderBreadcrumbs.appendChild(button);
  });

  if (!current.children?.length) {
    folderGrid.innerHTML = `<div class="folder-card">这个箱子暂时是空的，或者它太深了，第一版没有继续扫描。</div>`;
    return;
  }

  for (const child of current.children) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "folder-card";
    const appearance = child.type === "folder" ? "chest" : child.appearance || "paper";
    button.innerHTML = `
      <span class="folder-icon appearance-${appearance}"></span>
      <strong>${escapeHtml(child.name)}</strong>
      <span>${child.type === "folder" ? "箱子" : child.type === "app" ? "应用" : child.extension || "文件"}</span>
    `;
    button.addEventListener("click", () => {
      if (child.type === "folder") {
        state.folderStack.push(child);
        renderFolder();
      } else {
        openChildFile(child);
      }
    });
    folderGrid.appendChild(button);
  }
}

async function openChildFile(file) {
  await openSystemTarget(file);
}

async function openSystemTarget(target) {
  statusText.textContent = `正在打开 ${target.name}...`;
  try {
    if (window.webkit?.messageHandlers?.nativeOpen) {
      window.webkit.messageHandlers.nativeOpen.postMessage(target.path);
      statusText.textContent = `已交给系统打开：${target.name}`;
      return;
    }

    await fetch("/api/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: target.path })
    });
    statusText.textContent = `已交给系统打开：${target.name}`;
  } catch (error) {
    statusText.textContent = `打开失败：${error.message}`;
  }
}

function openLinksDialog() {
  document.body.classList.add("ui-open");
  setNativeCursorHidden(false);
  renderLinksDialog();
  linksDialog.showModal();
}

function renderLinksDialog() {
  const enabled = getEnabledAppIds();
  linksList.innerHTML = "";

  if (!state.apps.length) {
    linksList.innerHTML = `<div class="nearby-item">没有扫描到应用。点击刷新重新扫描。</div>`;
    return;
  }

  for (const app of state.apps) {
    const id = `link-${hashId(app.id)}`;
    const label = document.createElement("label");
    label.className = "link-row";
    label.innerHTML = `
      <input id="${id}" type="checkbox" data-app-id="${escapeHtml(app.id)}" ${enabled.has(app.id) ? "checked" : ""}>
      <span>
        <strong>${escapeHtml(displayNameFor(app))}</strong>
        <span>${escapeHtml(app.path)}</span>
      </span>
    `;
    linksList.appendChild(label);
  }
}

function hashId(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

async function applyLinksFromDialog() {
  const checkedIds = Array.from(linksList.querySelectorAll("input[type='checkbox']:checked"))
    .map((input) => input.dataset.appId)
    .filter(Boolean);

  state.world.enabledAppIds = checkedIds;
  if (state.selectedId && !getEnabledAppIds().has(state.selectedId) && state.selectedId.startsWith("app:")) {
    state.selectedId = null;
  }
  buildItems();
  renderSceneObjects();
  renderNearby();
  renderSelection();
  await saveWorld();
  linksDialog.close();
  statusText.textContent = `已更新 ${checkedIds.length} 个应用链接。`;
}

async function removeSelectedLink() {
  const selected = state.items.find((item) => item.id === state.selectedId);
  if (!selected || selected.type !== "app") return;

  state.world.enabledAppIds = Array.from(getEnabledAppIds()).filter((id) => id !== selected.id);
  state.selectedId = null;
  buildItems();
  renderSceneObjects();
  renderNearby();
  renderSelection();
  await saveWorld();
  statusText.textContent = `已从房间移除链接：${selected.name}`;
}

async function renameSelectedApp() {
  const app = selectedApp();
  if (!app) return;
  const nextName = renameInput.value.trim();
  if (!nextName) return;

  state.world.customNames = {
    ...(state.world.customNames || {}),
    [app.id]: nextName
  };
  buildItems();
  renderSceneObjects();
  renderNearby();
  state.selectedId = app.id;
  renderSelection();
  updateItemStates();
  await saveWorld();
  settingsDialog.close();
  statusText.textContent = `已把游戏内显示名改为：${nextName}`;
}

function isCustomFolderRoot(folder) {
  return normalizeFolderPaths(state.world.customFolderPaths).includes(folder.path);
}

function renderFolderRootsPanel() {
  if (!folderRootsList) return;
  const customPaths = normalizeFolderPaths(state.world.customFolderPaths);
  folderRootsList.innerHTML = "";

  if (!state.fileRoots.length) {
    folderRootsList.innerHTML = `<div class="folder-root-row">还没有可用的文件夹入口。</div>`;
    return;
  }

  for (const folder of state.fileRoots) {
    const row = document.createElement("div");
    row.className = "folder-root-row";
    const removable = customPaths.includes(folder.path);
    row.innerHTML = `
      <span>
        <strong>${escapeHtml(folder.name)}</strong>
        <span>${escapeHtml(folder.path)}</span>
      </span>
      ${removable ? `<button type="button" data-folder-path="${escapeHtml(folder.path)}">移除</button>` : `<em>默认</em>`}
    `;
    if (removable) {
      row.querySelector("button")?.addEventListener("click", () => removeFolderRoot(folder.path));
    }
    folderRootsList.appendChild(row);
  }

  for (const folderPath of customPaths.filter((path) => !state.fileRoots.some((folder) => folder.path === path))) {
    const row = document.createElement("div");
    row.className = "folder-root-row is-missing";
    row.innerHTML = `
      <span>
        <strong>未找到</strong>
        <span>${escapeHtml(folderPath)}</span>
      </span>
      <button type="button" data-folder-path="${escapeHtml(folderPath)}">移除</button>
    `;
    row.querySelector("button")?.addEventListener("click", () => removeFolderRoot(folderPath));
    folderRootsList.appendChild(row);
  }
}

async function addFolderRoot() {
  const folderPath = folderRootInput.value.trim();
  if (!folderPath) return;

  const nextPaths = normalizeFolderPaths([...(state.world.customFolderPaths || []), folderPath]);
  state.world.customFolderPaths = nextPaths;
  folderRootInput.value = "";
  await saveWorld({ silent: true });
  await refreshWorldData(`已添加文件夹入口：${folderPath}`);
}

async function removeFolderRoot(folderPath) {
  state.world.customFolderPaths = normalizeFolderPaths(state.world.customFolderPaths)
    .filter((path) => path !== folderPath);
  if (state.selectedId === `folder:${folderPath}`) {
    state.selectedId = null;
  }
  await saveWorld({ silent: true });
  await refreshWorldData(`已移除文件夹入口：${folderPath}`);
}

async function refreshWorldData(message = "已重新扫描文件夹入口。") {
  if (renderer) {
    objectGroup.clear();
  }
  await bootstrap();
  statusText.textContent = message;
}

function createWorldSnapshot() {
  const placements = {};
  for (const item of state.items) {
    placements[item.id] = item.position;
  }

  return {
    player: state.world.player,
    yaw: state.world.yaw,
    pitch: state.world.pitch,
    enabledAppIds: Array.from(getEnabledAppIds()),
    customFolderPaths: normalizeFolderPaths(state.world.customFolderPaths),
    customNames: state.world.customNames || {},
    placements
  };
}

function scheduleAutoSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    saveWorld({ silent: true });
  }, 900);
}

async function saveWorld(options = {}) {
  const payload = createWorldSnapshot();

  state.isSaving = true;
  const response = await fetch("/api/world", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  state.isSaving = false;

  if (!response.ok) {
    statusText.textContent = "保存失败。";
    return;
  }

  state.world = payload;
  if (!options.silent) {
    statusText.textContent = "布局已保存。";
  }
}

function exitToDesktop() {
  saveWorld({ silent: true });
  if (window.webkit?.messageHandlers?.nativeQuit) {
    window.webkit.messageHandlers.nativeQuit.postMessage("quit");
    return;
  }
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  document.body.innerHTML = `
    <main class="shell" style="display:grid;place-items:center;height:100vh;">
      <section class="panel" style="width:min(520px,calc(100vw - 32px));">
        <div class="panel-title">已退出游戏化桌面</div>
        <div class="selection">
          真实桌面没有被替换。关闭这个浏览器标签页即可回到普通电脑使用方式。
        </div>
      </section>
    </main>
  `;
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (event.key === "Escape") {
    if (settingsDialog.open) return;
    openSettingsDialog();
    event.preventDefault();
    return;
  }

  if (!canUseGameControls()) return;

  if (["w", "a", "s", "d", "q", "e", "arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) {
    state.keys.add(key);
    event.preventDefault();
  }

  if (event.key === "Enter") {
    openSelected();
    event.preventDefault();
  }
});

document.addEventListener("keyup", (event) => {
  state.keys.delete(event.key.toLowerCase());
});

saveButton.addEventListener("click", saveWorld);
manageLinksButton.addEventListener("click", openLinksDialog);
refreshButton.addEventListener("click", () => {
  refreshWorldData();
});
exitButton.addEventListener("click", exitToDesktop);
removeSelectedButton.addEventListener("click", removeSelectedLink);
searchInput.addEventListener("input", renderNearby);
closeFolderButton.addEventListener("click", () => folderDialog.close());
folderDialog.addEventListener("close", () => {
  if (!settingsDialog.open && !linksDialog.open) {
    document.body.classList.remove("ui-open");
    setNativeCursorHidden(true);
  }
  stage.focus?.();
});
closeLinksButton.addEventListener("click", () => linksDialog.close());
linksDialog.addEventListener("close", () => {
  if (!settingsDialog.open && !folderDialog.open) {
    document.body.classList.remove("ui-open");
    setNativeCursorHidden(true);
  }
  stage.focus?.();
});
closeSettingsButton.addEventListener("click", closeSettingsDialog);
resumeButton.addEventListener("click", closeSettingsDialog);
settingsDialog.addEventListener("close", () => {
  if (!folderDialog.open && !linksDialog.open) {
    document.body.classList.remove("ui-open");
    setNativeCursorHidden(true);
  }
  stage.focus?.();
});
settingsExitButton.addEventListener("click", exitToDesktop);
settingsLinksButton.addEventListener("click", () => {
  settingsDialog.close();
  openLinksDialog();
});
renameButton.addEventListener("click", renameSelectedApp);
addFolderRootButton.addEventListener("click", addFolderRoot);
refreshFolderRootsButton.addEventListener("click", () => refreshWorldData());
folderRootInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addFolderRoot();
    event.preventDefault();
  }
});
selectAllAppsButton.addEventListener("click", () => {
  linksList.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = true;
  });
});
clearAppsButton.addEventListener("click", () => {
  linksList.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = false;
  });
});
applyLinksButton.addEventListener("click", applyLinksFromDialog);
window.addEventListener("beforeunload", () => {
  const payload = JSON.stringify(createWorldSnapshot());
  navigator.sendBeacon?.("/api/world", new Blob([payload], { type: "application/json" }));
});

bootstrap().catch((error) => {
  statusText.textContent = `启动失败：${error.message}`;
});
