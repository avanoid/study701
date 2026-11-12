"use strict";

/**
 * Opens the quiz in a browser from a local address.
 * No packages required — Node.js is enough.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function openBrowser(url) {
  let child;
  if (process.platform === "win32") {
    child = spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
  } else if (process.platform === "darwin") {
    child = spawn("open", [url], { detached: true, stdio: "ignore" });
  } else {
    child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
  }
  child.on("error", function () { /* browser open is best-effort */ });
  child.unref();
}

function resolveFile(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(String(urlPath || "/").split("?")[0]);
  } catch (e) {
    return null;
  }
  if (pathname.indexOf("\0") !== -1) return null;
  if (pathname === "/") pathname = "/index.html";
  const resolved = path.resolve(root, "." + pathname);
  const rel = path.relative(root, resolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  if (parts.some(function (part) { return part === ".git" || part.charAt(0) === "."; })) return null;
  return resolved;
}

function handler(req, res) {
  const file = resolveFile(req.url);
  if (!file) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }
  fs.stat(file, function (statErr, stat) {
    if (statErr || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
}

function listen(port) {
  const server = http.createServer(handler);
  server.on("error", function (err) {
    if (err.code === "EADDRINUSE" && port < 8785) {
      listen(port + 1);
      return;
    }
    console.error(err.message);
    process.exit(1);
  });
  server.listen(port, "127.0.0.1", function () {
    const url = "http://127.0.0.1:" + port + "/";
    console.log("");
    console.log("  Security+ SY0-701 quizzes");
    console.log("  " + url);
    console.log("");
    console.log("  Leave this window open while you study.");
    console.log("  Close it, or press Ctrl+C, to stop.");
    console.log("");
    openBrowser(url);
  });
}

listen(8765);
