import site from "../website.js";
import { COOKIE, json, readCookie } from "../auth/http.js";
import fixtures from "../../.tmp/mori-dev/novel.json";

let seed;
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.origin !== env.MORI_SITE_ORIGIN || url.hostname !== "localhost") return json({}, 404);
    if (url.pathname === "/auth/local/login" || url.pathname === "/auth/local/logout") {
      url.pathname = url.pathname.endsWith("/login") ? "/login/github" : "/logout";
      return env.LOCAL_AUTH.fetch(new Request(url, request));
    }
    if (url.pathname.startsWith("/api/comments/attachments/local/")) {
      if (!await env.MORI_AUTH.verify(readCookie(request, COOKIE.site))) return json({ error: "LOGIN_REQUIRED" }, 401);
      url.pathname = url.pathname.slice(4);
      return env.LOCAL_API.fetch(new Request(url, request));
    }
    if (url.pathname.startsWith("/api/novel/")) {
      if (!url.pathname.startsWith(`/api/novel/${fixtures.version}/`)) return json({}, 404);
      seed ||= (async () => {
        const { version, manifest, objects } = fixtures;
        if (await env.NOVEL_VAULT.head(`v1/versions/${version}.json`)) return;
        for (const [digest, base64] of Object.entries(objects))
          await env.NOVEL_VAULT.put(`v1/objects/${digest}`, Uint8Array.from(atob(base64), (byte) => byte.charCodeAt(0)));
        await env.NOVEL_VAULT.put(`v1/versions/${version}.json`, JSON.stringify(manifest));
      })().catch((error) => { seed = undefined; throw error; });
      await seed;
    }
    return site.fetch(request, {
      ...env,
      PUBLIC_API: env.PUBLIC_API || env.LOCAL_API,
    });
  },
};
