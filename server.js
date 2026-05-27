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

// Keep the static server constrained to the packaged frontend surface.
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
    // Bound request size even on localhost; WebView clients are not a trust boundary.
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
  // Application discovery is intentionally shallow: only first-level .app bundles in known roots.
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
  // Presentation-only heuristic. The returned value must not affect file access decisions.
  const lower = name.toLowerCase();
  if (lower.includes("chrome") || lower.includes("safari") || lower.includes("browser")) return "portal";
  if (lower.includes("music") || lower.includes("spotify")) return "record";
  if (lower.includes("terminal") || lower.includes("code")) return "console";
  if (lower.includes("notes") || lower.includes("word") || lower.includes("pages")) return "book";
  if (lower.includes("photo") || lower.includes("preview")) return "frame";
  return "artifact";
}

async function scanFolder(folderPath, depth = 0) {
  // Contract with the renderer: every node is normalized to folder, file, or app.
  const stats = await fs.stat(folderPath);
  const node = {
    id: `folder:${folderPath}`,
    type: "folder",
    name: path.basename(folderPath) || folderPath,
    path: folderPath,
    modifiedAt: stats.mtimeMs,
    children: []
  };

  // Keep bootstrap latency bounded; deeper navigation can be added as lazy loading later.
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
    // Cap fan-out so one large directory cannot dominate startup time or response size.
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
  // Canonicalize user-supplied paths before dedupe, persistence, and allowlist checks.
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
  // Path containment must be segment-aware; prefix checks are unsafe for sibling paths.
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
  // Persist only existing directories under $HOME. Symlinks are resolved before the check.
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
  // Shared allowlist for open operations. Client-provided paths are validated against realpaths.
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
  // Treat persisted world data as untrusted input because it can be edited outside the app.
  const customFolderPaths = await sanitizeCustomFolderPaths(world?.customFolderPaths);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(worldPath, JSON.stringify({
    ...world,
    customFolderPaths
  }, null, 2));
}

async function validateOpenTarget(targetPath) {
  // /api/open is the only endpoint that triggers a system action, so it revalidates all input.
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
    // execFile bypasses the shell, so targetPath is passed as data rather than command text.
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
    // Bootstrap is intentionally coarse-grained; the scene is rebuilt from one consistent snapshot.
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

  // Reject traversal after normalization; encoded ../ segments must not escape publicDir.
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
