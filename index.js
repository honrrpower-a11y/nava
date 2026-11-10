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
          "Access-Control-Allow-Headers": "Content-Type, X-Nava-Test-Token, Authorization, X-Navi-Database",
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

    // Only NAVI requests carrying the explicit preview header use the isolated
    // preview D1 database. Lyrics and music always retain the production env.
    const useNaviPreviewDb =
      request.headers.get("X-Navi-Database") === "preview";

    if (useNaviPreviewDb && !env.NAVI_PREVIEW_DB) {
      return json({
        success: false,
        error: "NAVI preview database is not configured."
      }, 503, corsOrigin);
    }

    const naviEnv = useNaviPreviewDb
      ? { ...env, NAVA_DB: env.NAVI_PREVIEW_DB }
      : env;

    const context = { request, env: naviEnv, url, origin, corsOrigin };
    const naviResponse = await handleNaviRoute(context);
    if (naviResponse) return naviResponse;

    const lyricsResponse = await handleLyricsRoute(context);
    if (lyricsResponse) return lyricsResponse;

    const musicResponse = await handleMusicRoute(context);
    if (musicResponse) return musicResponse;

    return json({ error: "Not found" }, 404, corsOrigin);
  }
};
