export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json", ...cors }
      });

    const unauthorized = () => new Response("Unauthorized", { status: 401, headers: cors });
    const bad = (msg = "Bad Request") => new Response(msg, { status: 400, headers: cors });

    // Bearer token check for POST routes
    const isAuthed = () => {
      const auth = request.headers.get("Authorization") || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
      return token && env.ADMIN_TOKEN && token === env.ADMIN_TOKEN;
    };

    // Helper: list all KV JSON values under a prefix (with pagination)
    async function listKV(ns, prefix) {
      const out = [];
      let cursor;
      do {
        const { keys, list_complete, cursor: cur } = await ns.list({ prefix, cursor });
        cursor = cur;
        for (const k of keys) {
          const val = await ns.get(k.name, "json");
          if (val) out.push(val);
        }
        if (list_complete) break;
      } while (cursor);
      return out;
    }

    // ----- Health -----
    if (path === "/" || path === "/health") {
      return json({ ok: true, service: "pkmntcg-deals-api", time: Date.now() });
    }

    // ----- Posts (tiny blog/updates) -----
    if (path === "/posts" && method === "GET") {
      const posts = await listKV(env.POSTS, "post:");
      posts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      return json(posts.slice(0, 50));
    }

    if (path === "/posts" && method === "POST") {
      if (!isAuthed()) return unauthorized();
      const body = await request.json().catch(() => null);
      if (!body || !body.title) return bad("Missing title");

      const item = {
        id: crypto.randomUUID(),
        title: body.title,
        body: body.body || "",
        url: body.url || "",
        timestamp: body.timestamp || Date.now()
      };
      await env.POSTS.put(`post:${item.timestamp}:${item.id}`, JSON.stringify(item));
      return json({ ok: true, id: item.id });
    }

    // ----- Success Feed (image posts) -----
    if (path === "/feed" && method === "GET") {
      const items = await listKV(env.FEED, "feed:");
      items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      return json(items.slice(0, 60));
    }

    if (path === "/feed" && method === "POST") {
      if (!isAuthed()) return unauthorized();
      const body = await request.json().catch(() => null);
      if (!body || !body.image_url) return bad("Missing image_url");

      const item = {
        id: crypto.randomUUID(),
        image_url: body.image_url,
        caption: body.caption || "",
        author: body.author || "",
        message_url: body.message_url || "",
        retailer: body.retailer || "",
        timestamp: body.timestamp || Date.now()
      };
      await env.FEED.put(`feed:${item.timestamp}:${item.id}`, JSON.stringify(item));
      return json({ ok: true, id: item.id });
    }

    // ----- Simple stats -----
    if (path === "/stats" && method === "GET") {
      const posts = await listKV(env.POSTS, "post:");
      const feed = await listKV(env.FEED, "feed:");
      return json({
        posts: posts.length,
        wins: feed.length,
        lastUpdate: Date.now()
      });
    }

    return new Response("Not Found", { status: 404, headers: cors });
  }
}
