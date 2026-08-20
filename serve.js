/* Tiny local web server for Pedro.
   Run:  node serve.js      then open http://localhost:8777
   Browsers treat localhost as a secure origin, so the microphone, hands-free
   mode, the PIN lock and the service worker all work here - unlike opening
   index.html directly as a file. */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8777;
const ROOT = __dirname;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".md":   "text/markdown; charset=utf-8"
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";

  // never serve outside this folder
  const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ""));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end("no"); return; }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, {"content-type":"text/plain"}).end("Not found: " + rel); return; }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"          // always serve the newest build
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log("Pedro is running at  http://localhost:" + PORT);
  console.log("Press Ctrl+C to stop.");
});
