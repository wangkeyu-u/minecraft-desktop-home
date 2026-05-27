import http from "node:http";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const worldPath = path.join(dataDir, "world.json");
const port = Number(process.env.PORT || 4173);

// 静态资源只服务本项目 public 目录里的前端文件，避免把本机其他文件暴露出来。
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"]
]);

const defaultWatchedFolders = [
  path.join(os.homedir(), "Desktop"),
  path.join(os.homedir(), "Documents"),
  path.join(os.homedir(), "Downloads")
];

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    // 本地工具也要限制请求体大小，防止异常请求把进程内存打爆。
    if (size > 2_000_000) {
      throw createHttpError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listApplications() {
  // MVP 阶段只扫描 macOS 标准应用目录，数据量可控，也更容易解释权限边界。
  const roots = ["/Applications", path.join(os.homedir(), "Applications")];
  const apps = [];

  for (const root of roots) {
    if (!(await exists(root))) continue;
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith(".app")) continue;
      const displayName = entry.name.replace(/\.app$/i, "");
      apps.push({
        id: `app:${path.join(root, entry.name)}`,
        type: "app",
        name: displayName,
        path: path.join(root, entry.name),
        appearance: pickAppAppearance(displayName)
      });
    }
  }

  return apps.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 48);
}

function pickAppAppearance(name) {
  // 用简单规则把真实应用映射到游戏里的物品外观，后续可以替换成可配置皮肤系统。
  const lower = name.toLowerCase();
  if (lower.includes("chrome") || lower.includes("safari") || lower.includes("browser")) return "portal";
  if (lower.includes("music") || lower.includes("spotify")) return "record";
  if (lower.includes("terminal") || lower.includes("code")) return "console";
  if (lower.includes("notes") || lower.includes("word") || lower.includes("pages")) return "book";
  if (lower.includes("photo") || lower.includes("preview")) return "frame";
  return "artifact";
}

async function scanFolder(folderPath, depth = 0) {
  // 服务端把真实文件夹转换成前端可直接渲染的树形结构：folder / file / app。
  const stats = await fs.stat(folderPath);
  const node = {
    id: `folder:${folderPath}`,
    type: "folder",
    name: path.basename(folderPath) || folderPath,
    path: folderPath,
    modifiedAt: stats.mtimeMs,
    children: []
  };

  // 限制递归深度，避免一次启动扫描整个用户目录导致卡顿。
  if (depth >= 3) return node;

  let entries = [];
  try {
    entries = await fs.readdir(folderPath, { withFileTypes: true });
  } catch {
    return node;
  }

  const visibleEntries = entries
    .filter((entry) => !entry.name.startsWith("."))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    // 单层限制数量，保证大目录也能快速进入游戏。
    .slice(0, 80);

  for (const entry of visibleEntries) {
    const childPath = path.join(folderPath, entry.name);
    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      const displayName = entry.name.replace(/\.app$/i, "");
      node.children.push({
        id: `app:${childPath}`,
        type: "app",
        name: displayName,
        path: childPath,
        appearance: pickAppAppearance(displayName)
      });
    } else if (entry.isDirectory()) {
      node.children.push(await scanFolder(childPath, depth + 1));
    } else {
      const childStats = await fs.stat(childPath);
      node.children.push({
        id: `file:${childPath}`,
        type: "file",
        name: entry.name,
        path: childPath,
        extension: path.extname(entry.name).toLowerCase(),
        appearance: pickFileAppearance(entry.name),
        modifiedAt: childStats.mtimeMs,
        size: childStats.size
      });
    }
  }

  return node;
}

function pickFileAppearance(name) {
  const ext = path.extname(name).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic"].includes(ext)) return "frame";
  if ([".mp3", ".wav", ".m4a", ".flac"].includes(ext)) return "record";
  if ([".js", ".ts", ".py", ".java", ".cpp", ".html", ".css", ".json"].includes(ext)) return "code";
  if ([".pdf", ".doc", ".docx", ".md", ".txt", ".pages"].includes(ext)) return "book";
  if ([".zip", ".rar", ".7z", ".tar", ".gz"].includes(ext)) return "crate";
  return "paper";
}

function normalizeFolderPaths(paths) {
  // 用户输入可能包含空格、重复路径或 ~，统一归一化后再保存和比较。
  if (!Array.isArray(paths)) return [];
  return Array.from(new Set(
    paths
      .filter((folderPath) => typeof folderPath === "string")
      .map((folderPath) => folderPath.trim())
      .filter(Boolean)
      .map((folderPath) => path.resolve(folderPath.replace(/^~(?=$|\/)/, os.homedir())))
  ));
}

function isPathInside(rootPath, targetPath) {
  // 用 path.relative 判断包含关系，避免简单 startsWith 被相似路径绕过。
  const relative = path.relative(rootPath, targetPath);
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

async function realPathIfExists(targetPath) {
  try {
    return await fs.realpath(targetPath);
  } catch {
    return null;
  }
}

async function sanitizeCustomFolderPaths(paths) {
  // 自定义入口只允许用户主目录内真实存在的文件夹，降低误开系统敏感路径的风险。
  const homePath = await realPathIfExists(os.homedir()) || os.homedir();
  const safePaths = [];

  for (const folderPath of normalizeFolderPaths(paths)) {
    const realFolderPath = await realPathIfExists(folderPath);
    if (!realFolderPath || !isPathInside(homePath, realFolderPath)) continue;

    const stats = await fs.stat(realFolderPath).catch(() => null);
    if (stats?.isDirectory()) {
      safePaths.push(realFolderPath);
    }
  }

  return Array.from(new Set(safePaths));
}

async function allowedOpenRoots(customFolderPaths = []) {
  // 打开真实文件前会用这组 allowlist 校验，前端传什么路径都不能直接信任。
  const roots = [
    "/Applications",
    path.join(os.homedir(), "Applications"),
    ...defaultWatchedFolders,
    ...normalizeFolderPaths(customFolderPaths)
  ];

  const realRoots = await Promise.all(roots.map(realPathIfExists));
  return realRoots.filter(Boolean);
}

async function listFileRoots(customFolderPaths = []) {
  const roots = [];
  const safeCustomFolderPaths = await sanitizeCustomFolderPaths(customFolderPaths);
  for (const folderPath of normalizeFolderPaths([...defaultWatchedFolders, ...safeCustomFolderPaths])) {
    if (await exists(folderPath)) {
      roots.push(await scanFolder(folderPath));
    }
  }
  return roots;
}

async function getWorld() {
  try {
    return JSON.parse(await fs.readFile(worldPath, "utf8"));
  } catch {
    return {
      player: { x: 6, y: 5 },
      customFolderPaths: [],
      placements: {}
    };
  }
}

async function saveWorld(world) {
  // 存档写入前再次清洗自定义路径，保证 data/world.json 里不会留下不可信目录。
  const customFolderPaths = await sanitizeCustomFolderPaths(world?.customFolderPaths);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(worldPath, JSON.stringify({
    ...world,
    customFolderPaths
  }, null, 2));
}

async function validateOpenTarget(targetPath) {
  // /api/open 是最敏感的接口：必须确认目标存在，且位于扫描过的安全根目录内。
  if (!targetPath || typeof targetPath !== "string") {
    throw createHttpError(400, "Missing target path.");
  }

  const world = await getWorld();
  const targetRealPath = await realPathIfExists(
    path.resolve(targetPath.replace(/^~(?=$|\/)/, os.homedir()))
  );

  if (!targetRealPath) {
    throw createHttpError(404, "Target no longer exists.");
  }

  const roots = await allowedOpenRoots(world.customFolderPaths);
  const allowed = roots.some((rootPath) => isPathInside(rootPath, targetRealPath));
  if (!allowed) {
    throw createHttpError(403, "Target is outside allowed scanned folders.");
  }

  return targetRealPath;
}

function openTarget(targetPath) {
  return new Promise((resolve, reject) => {
    // execFile 不经过 shell，不拼接命令字符串，避免路径里特殊字符造成命令注入。
    execFile("open", [targetPath], (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    // 启动数据一次性返回：应用列表、文件入口和上次存档，前端据此搭建房间。
    const world = await getWorld();
    const [apps, fileRoots] = await Promise.all([
      listApplications(),
      listFileRoots(world.customFolderPaths)
    ]);
    sendJson(res, 200, { apps, fileRoots, world });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/open") {
    const body = await readBody(req);
    const targetPath = await validateOpenTarget(body.path);
    await openTarget(targetPath);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/world") {
    const body = await readBody(req);
    await saveWorld(body);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "Not found." });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const resolvedPath = path.normalize(path.join(publicDir, requestedPath));

  // 防目录穿越：即使 URL 里带 ../，最终路径也必须留在 public 目录内。
  if (!resolvedPath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(resolvedPath);
    res.writeHead(200, {
      "content-type": mimeTypes.get(path.extname(resolvedPath)) || "application/octet-stream"
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Minecraft desktop home is running at http://localhost:${port}`);
});
