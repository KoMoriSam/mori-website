import {
  cleanupAnalyticsEvents,
  handleAnalyticsEvents,
  handleAnalyticsStats,
} from "./api/analytics.js";
import { handleAnnouncements } from "./api/announcements.js";
import { handleChangelog } from "./api/changelog.js";
import { handleRandomHero } from "./api/hero.js";
import { handleGames } from "./games/gateway.js";
import { routeGithubRequest } from "./github/routes.js";
import { buildCorsHeaders, resolveCorsOrigin } from "./lib/cors.js";
import { jsonResponse } from "./lib/http.js";
export { GameRoom } from "./games/room.js";

function handleServiceInfo(corsOrigin) {
  return jsonResponse(
    {
      ok: true,
      service: "komorisam-api",
      endpoints: {
        githubProfile: {
          method: "GET",
          path: "/github/users/:username",
        },
        githubRepository: {
          method: "GET",
          path: "/github/repos/:owner/:repo",
        },
        githubDiscussionCounts: {
          method: "POST",
          path: "/github/discussions/counts",
        },
        randomHero: {
          method: "GET",
          path: "/random-hero",
        },
        analyticsStats: {
          method: "GET",
          path: "/analytics/stats",
        },
        analyticsEvents: {
          method: "POST",
          path: "/analytics/events",
        },
        announcements: {
          method: "GET",
          path: "/announcements",
        },
        changelog: {
          method: "GET",
          path: "/changelog",
        },
      },
    },
    200,
    corsOrigin,
  );
}

export default {
  async fetch(request, env) {
    const corsOrigin = resolveCorsOrigin(request, env);
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    if (pathname === "/games/rooms" || pathname.startsWith("/games/rooms/")) {
      return handleGames(request, env);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(corsOrigin),
      });
    }

    if (pathname === "/") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method Not Allowed" }, 405, corsOrigin);
      }

      return handleServiceInfo(corsOrigin);
    }

    const githubResponse = routeGithubRequest(
      request,
      env,
      pathname,
      buildCorsHeaders(corsOrigin),
    );
    if (githubResponse) return githubResponse;

    if (pathname === "/random-hero" || pathname === "/api/random-hero") {
      return handleRandomHero(request, env, corsOrigin);
    }

    if (pathname === "/analytics/stats") {
      return handleAnalyticsStats(request, env, corsOrigin);
    }

    if (pathname === "/analytics/events") {
      return handleAnalyticsEvents(request, env, corsOrigin);
    }

    if (pathname === "/announcements") {
      return handleAnnouncements(request, env, corsOrigin);
    }

    if (pathname === "/changelog") {
      return handleChangelog(request, env, corsOrigin);
    }

    return jsonResponse(
      {
        error: "NOT_FOUND",
        message: "接口不存在。",
        path: pathname,
      },
      404,
      corsOrigin,
    );
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      cleanupAnalyticsEvents(env).catch((error) => {
        console.error(
          JSON.stringify({
            message: "analytics event cleanup failed",
            error: String(error?.message || error),
          }),
        );
      }),
    );
  },
};
