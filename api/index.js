export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();

    // --- CORS ---
    const origin = env.CORS_ORIGIN || "*";
    const CORS = {
      "Access-Control-Allow-Origin":  origin,
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "authorization,content-type",
      Vary: "Origin",
    };
    if (method === "OPTIONS") return new Response("", { headers: CORS });

    const json = (data, extra = {}) =>
      new Response(JSON.stringify(data), {
        headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra },
      });
    const bad = (msg, code = 400) => json({ ok: false, error: msg }, { status: code });

    // --- Auth helpers: accept ADMIN_TOKEN or UPLOAD_KEY ---
    const bearer = (req) => {
      const h = req.headers.get("authorization") || "";
      return h.startsWith("Bearer ") ? h.slice(7) : "";
    };
    const isAuthed = () => {
      const t = bearer(request);
      if (!t) return false;
      return (env.ADMIN_TOKEN && t === env.ADMIN_TOKEN) ||
             (env.UPLOAD_KEY && t === env.UPLOAD_KEY);
    };

    // --- small helpers ---
    const guessType = (nameOrExt) => {
      const n = String(nameOrExt).toLowerCase();
      if (n.endsWith(".png") || n === "png")  return "image/png";
      if (n.endsWith(".webp")|| n === "webp") return "image/webp";
      if (n.endsWith(".jpg") || n.endsWith(".jpeg") || n === "jpg" || n === "jpeg")
        return "image/jpeg";
      return "application/octet-stream";
    };

    async function listKV(ns, prefix) {
      const out = [];
      let cursor;
      do {
        const { keys, list_complete, cursor: next } = await ns.list({ prefix, cursor });
        for (const k of keys) {
          const v = await ns.get(k.name, "json");
          if (v) out.push({ key: k.name, value: v });
        }
        cursor = list_complete ? undefined : next;
      } while (cursor);
      return out;
    }
    async function trimPosts(ns, prefix, max) {
      const names = [];
      let cursor;
      do {
        const { keys, list_complete, cursor: next } = await ns.list({ prefix, cursor });
        for (const k of keys) names.push(k.name);
        cursor = list_complete ? undefined : next;
      } while (cursor);
      names.sort();
      if (names.length > max) {
        const toDelete = names.slice(0, names.length - max);
        await Promise.all(toDelete.map((n) => ns.delete(n)));
      }
    }

    // -------------------------
    // Health
    // -------------------------
    if (path === "/" || path === "/health") {
      return json({ ok: true, service: "pkmntcg-deals-api", now: Date.now() });
    }

    // -------------------------
    // Image serve / delete
    // GET /i/<name>
    // DELETE /i/<name>  (auth required)
    // -------------------------
    if (path.startsWith("/i/") && (method === "GET" || method === "DELETE")) {
      if (!env.IMAGES) return bad("images store not configured", 500);
      const name = path.slice(3); // "abc123.jpg"
      const prefix = (env.R2_PREFIX || "img").replace(/\/+$/, "");
      const key = `${prefix}/${name}`;

      if (method === "GET") {
        const obj = await env.IMAGES.get(key);
        if (!obj) return new Response("Not found", { status: 404, headers: CORS });
        return new Response(obj.body, {
          headers: {
            "content-type": obj.httpMetadata?.contentType || guessType(name),
            "cache-control": "public, max-age=31536000, immutable",
            ...CORS,
          },
        });
      } else {
        if (!isAuthed()) return bad("unauthorized", 401);
        await env.IMAGES.delete(key);
        return json({ ok: true, deleted: name });
      }
    }

    // -------------------------
    // Image upload: POST /upload
    // form-data field: "file", or raw body
    // Returns: { ok, key, image_url, content_type }
    // -------------------------
    if (path === "/upload" && method === "POST") {
      if (!isAuthed()) return bad("unauthorized", 401);
      if (!env.IMAGES) return bad("images store not configured", 500);

      const ct = (request.headers.get("content-type") || "").toLowerCase();
      let bytes;
      let ext = "jpg";
      let contentType = "image/jpeg";

      if (ct.startsWith("multipart/form-data")) {
        const form = await request.formData();
        const f = form.get("file");
        if (!(f instanceof File)) return bad("missing file");
        bytes = new Uint8Array(await f.arrayBuffer());
        const n = (f.name || "").toLowerCase();
        if (n.endsWith(".png")) { ext = "png"; contentType = "image/png"; }
        else if (n.endsWith(".webp")) { ext = "webp"; contentType = "image/webp"; }
        else { ext = "jpg"; contentType = "image/jpeg"; }
      } else {
        bytes = new Uint8Array(await request.arrayBuffer());
        if (ct.includes("png"))       { ext = "png";  contentType = "image/png"; }
        else if (ct.includes("webp")) { ext = "webp"; contentType = "image/webp"; }
        else                          { ext = "jpg";  contentType = "image/jpeg"; }
      }

      const id  = crypto.randomUUID().replace(/-/g, "");
      const prefix = (env.R2_PREFIX || "img").replace(/\/+$/, "");
      const key = `${prefix}/${id}.${ext}`;

      await env.IMAGES.put(key, bytes, {
        httpMetadata: { contentType },
      });

      // Prefer direct public R2 URL if provided; otherwise use Worker /i/
      const base = (env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");
      const image_url = base ? `${base}/${key}`
                             : new URL(`/i/${id}.${ext}`, url.origin).toString();

      return json({ ok: true, key, image_url, content_type: contentType });
    }

    // -------------------------
    // Feed
    // -------------------------
    if (path === "/feed" && method === "GET") {
      const items = await listKV(env.POSTS, "post:");
      items.sort((a, b) => (b.value.timestamp || 0) - (a.value.timestamp || 0));
      const lean = items.slice(0, 48).map((x) => x.value);
      return json(lean, { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" });
    }

    // -------------------------
    // Stats
    // -------------------------
    if (path === "/stats" && method === "GET") {
      const cacheHdr = { "Cache-Control": "no-store" }; // <- always fresh
    
      const raw = await env.POSTS.get("stats:current", "json");
      if (raw) return json(raw, cacheHdr);
    
      const items  = await listKV(env.POSTS, "post:");
      const cutoff = Date.now() - 14 * 24 * 3600 * 1000;
      const recent = items.filter(i => (i.value.timestamp || 0) >= cutoff).length;
      return json(
        { members: 1200, alerts_per_week: 85, recent_wins: Math.max(recent, 8) },
        cacheHdr
      );
    }
    

    if (path === "/stats" && method === "POST") {
      if (!isAuthed()) return bad("unauthorized", 401);
      let body;
      try { body = await request.json(); } catch { return bad("invalid json"); }
      const doc = {
        members:        Number(body.members)        || 0,
        alerts_per_week:Number(body.alerts_per_week)|| 0,
        recent_wins:    Number(body.recent_wins)    || 0,
        updated_at:     Date.now(),
      };
      await env.POSTS.put("stats:current", JSON.stringify(doc));
      return json({ ok: true });
    }

    // -------------------------
    // Posts
    // -------------------------
    if (path === "/posts" && method === "POST") {
      if (!isAuthed()) return bad("unauthorized", 401);
      let body;
      try { body = await request.json(); } catch { return bad("invalid json"); }
      if (!body?.image_url) return bad("missing image_url");

      const ts    = Number(body.timestamp) || Date.now();
      const id    = String(body.id || "");
      const tsKey = String(ts).padStart(13, "0");
      const key   = id ? `post:${tsKey}:${id}` : `post:${tsKey}:${crypto.randomUUID()}`;

      const item = {
        id:          id || undefined,
        image_url:   String(body.image_url),
        caption:     body.caption     ? String(body.caption)  : "",
        author:      body.author      ? String(body.author)   : "",
        retailer:    body.retailer    ? String(body.retailer) : "",
        timestamp:   ts,
        message_url: body.message_url ? String(body.message_url) : "",
      };

      await env.POSTS.put(key, JSON.stringify(item));
      const max = parseInt(env.MAX_POSTS || "50", 10);
      await trimPosts(env.POSTS, "post:", max);
      return json({ ok: true, key });
    }

    // Fallback
    return bad("not found", 404);
  },
};
