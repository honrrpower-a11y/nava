// ورودی اصلی Cloudflare Worker نوا
import { ALLOWED_ORIGIN } from "./modules/config.js";
import { json } from "./modules/shared.js";
import { handleNaviRoute } from "./modules/navi.js";
import { handleLyricsRoute } from "./modules/lyrics.js";
import { handleMusicRoute } from "./modules/music.js";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsOrigin = origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "null";

    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Nava-Test-Token, Authorization",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      });
    }

    const url = new URL(request.url);

    if (url.pathname === "/status" && request.method === "GET") {
      return json({
        success: true,
        message: "Nava Worker is running",
        version: "nava-modular-1.0",
        timestamp: new Date().toISOString()
      }, 200, corsOrigin);
    }

    const naviContext = { request, env, url, origin, corsOrigin };
    const naviResponse = await handleNaviRoute(naviContext);
    if (naviResponse) return naviResponse;

    // Keep the original production environment for all non-NAVI routes.
    const context = { request, env, url, origin, corsOrigin };
    const lyricsResponse = await handleLyricsRoute(context);
    if (lyricsResponse) return lyricsResponse;

    const musicResponse = await handleMusicRoute(context);
    if (musicResponse) return musicResponse;

    return json({ error: "Not found" }, 404, corsOrigin);
  }
};
