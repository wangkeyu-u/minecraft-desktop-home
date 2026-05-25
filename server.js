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
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
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
  const lower = name.toLowerCase();
  if (lower.includes("chrome") || lower.includes("safari") || lower.includes("browser")) return "portal";
  if (lower.includes("music") || lower.includes("spotify")) return "record";
  if (lower.includes("terminal") || lower.includes("code")) return "console";
  if (lower.includes("notes") || lower.includes("word") || lower.includes("pages")) return "book";
  if (lower.includes("photo") || lower.includes("preview")) return "frame";
  return "artifact";
}

async function scanFolder(folderPath, depth = 0) {
  const stats = await fs.stat(folderPath);
  const node = {
    id: `folder:${folderPath}`,
    type: "folder",
    name: path.basename(folderPath) || folderPath,
    path: folderPath,
    modifiedAt: stats.mtimeMs,
    children: []
  };

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
  if (!Array.isArray(paths)) return [];
  return Array.from(new Set(
    paths
      .filter((folderPath) => typeof folderPath === "string")
      .map((folderPath) => folderPath.trim())
      .filter(Boolean)
      .map((folderPath) => path.resolve(folderPath.replace(/^~(?=$|\/)/, os.homedir())))
  ));
}

async function listFileRoots(customFolderPaths = []) {
  const roots = [];
  for (const folderPath of normalizeFolderPaths([...defaultWatchedFolders, ...customFolderPaths])) {
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
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(worldPath, JSON.stringify({
    ...world,
    customFolderPaths: normalizeFolderPaths(world.customFolderPaths)
  }, null, 2));
}

function openTarget(targetPath) {
  return new Promise((resolve, reject) => {
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
    if (!body.path || typeof body.path !== "string") {
      sendJson(res, 400, { error: "Missing target path." });
      return;
    }
    await openTarget(body.path);
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
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Minecraft desktop home is running at http://localhost:${port}`);
});
