const TABLE_NAME = "dashboard_upload_histories";

function sendJson(response, status, payload) {
  response.status(status).json(payload);
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function isValidStorageKey(key) {
  return /^[a-z0-9_-]+$/i.test(key || "");
}

function normalizePayload(payload) {
  if (typeof payload === "string") {
    try { return JSON.parse(payload || "{}"); } catch { return {}; }
  }
  return payload && typeof payload === "object" ? payload : {};
}

async function readPayload(request) {
  if (request.body) return normalizePayload(request.body);

  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => resolve(normalizePayload(body)));
    request.on("error", reject);
  });
}

async function supabaseRequest(path, options = {}) {
  const config = getSupabaseConfig();
  if (!config) {
    const error = new Error("Variaveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nao configuradas.");
    error.status = 500;
    throw error;
  }

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(text || "Erro na API do Supabase");
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export default async function handler(request, response) {
  try {
    if (request.method === "GET") {
      const key = request.query?.key;
      if (!isValidStorageKey(key)) return sendJson(response, 400, { ok: false, error: "Chave invalida" });

      const rows = await supabaseRequest(`${TABLE_NAME}?select=updated_at,history&key=eq.${encodeURIComponent(key)}&limit=1`);
      const row = Array.isArray(rows) ? rows[0] : null;
      return sendJson(response, 200, {
        ok: true,
        updatedAt: Number(row?.updated_at) || 0,
        history: Array.isArray(row?.history) ? row.history : []
      });
    }

    if (request.method === "POST" || request.method === "PUT") {
      const payload = await readPayload(request);
      if (!isValidStorageKey(payload.key) || !Array.isArray(payload.history)) {
        return sendJson(response, 400, { ok: false, error: "Payload invalido" });
      }

      const updatedAt = Number(payload.updatedAt) || Date.now();
      await supabaseRequest(TABLE_NAME, {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates"
        },
        body: JSON.stringify({
          key: payload.key,
          updated_at: updatedAt,
          history: payload.history,
          saved_at: new Date().toISOString()
        })
      });

      return sendJson(response, 200, { ok: true, updatedAt });
    }

    return sendJson(response, 405, { ok: false });
  } catch (error) {
    return sendJson(response, error.status || 500, { ok: false, error: error.message });
  }
}
