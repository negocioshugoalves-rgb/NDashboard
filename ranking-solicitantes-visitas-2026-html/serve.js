const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = 8766;
const dataDir = path.join(root, "..", ".dashboard-data");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {
        reject(new Error("Payload muito grande"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function storagePath(key) {
  if (!/^[a-z0-9_-]+$/i.test(key || "")) return null;
  return path.join(dataDir, `${key}.json`);
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/check-upload-password") {
    if (request.method !== "POST") return sendJson(response, 405, { ok: false });
    const payload = JSON.parse((await readBody(request)) || "{}");
    const expected = process.env.UPLOAD_PASSWORD || "";
    if (expected && payload.password !== expected) return sendJson(response, 401, { ok: false });
    if (!expected && !payload.password) return sendJson(response, 401, { ok: false });
    return sendJson(response, 200, { ok: true });
  }

  if (url.pathname === "/api/upload-history") {
    if (request.method === "GET") {
      const filePath = storagePath(url.searchParams.get("key"));
      if (!filePath) return sendJson(response, 400, { ok: false, error: "Chave invalida" });
      fs.readFile(filePath, "utf8", (error, data) => {
        if (error) return sendJson(response, 200, { ok: true, updatedAt: 0, history: [] });
        try {
          const parsed = JSON.parse(data);
          return sendJson(response, 200, { ok: true, updatedAt: parsed.updatedAt || 0, history: parsed.history || [] });
        } catch {
          return sendJson(response, 200, { ok: true, updatedAt: 0, history: [] });
        }
      });
      return;
    }

    if (request.method === "PUT" || request.method === "POST") {
      const payload = JSON.parse((await readBody(request)) || "{}");
      const filePath = storagePath(payload.key);
      if (!filePath || !Array.isArray(payload.history)) return sendJson(response, 400, { ok: false, error: "Payload invalido" });
      fs.mkdirSync(dataDir, { recursive: true });
      const record = {
        updatedAt: Number(payload.updatedAt) || Date.now(),
        history: payload.history
      };
      fs.writeFile(filePath, JSON.stringify(record), "utf8", error => {
        if (error) return sendJson(response, 500, { ok: false, error: "Falha ao salvar" });
        return sendJson(response, 200, { ok: true, updatedAt: record.updatedAt });
      });
      return;
    }
  }

  sendJson(response, 404, { ok: false });
}

http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
  if (requestUrl.pathname.startsWith("/api/")) {
    handleApi(request, response, requestUrl).catch(error => sendJson(response, 500, { ok: false, error: error.message }));
    return;
  }

  const urlPath = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
  const filePath = path.normalize(path.join(root, urlPath));
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mime[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(data);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`Dashboard em http://127.0.0.1:${port}/`);
});
