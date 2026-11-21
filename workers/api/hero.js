import { jsonResponse } from "../lib/http.js";

const HERO_CACHE_TTL_SECONDS = 60 * 60;
const PIXABAY_RATE_LIMIT = 20;
const PIXABAY_RATE_WINDOW = 60;
const PIXABAY_API_ENDPOINT = "https://pixabay.com/api/";

async function checkPixabayRateLimit(request, env) {
  if (!env.RATE_LIMIT_KV) {
    return true;
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = `pixabay:${ip}`;
  const count = Number(await env.RATE_LIMIT_KV.get(key)) || 0;

  if (count >= PIXABAY_RATE_LIMIT) {
    return false;
  }

  await env.RATE_LIMIT_KV.put(key, String(count + 1), {
    expirationTtl: PIXABAY_RATE_WINDOW,
  });

  return true;
}

function getHeroCache(request) {
  return caches.default.match(new Request(request.url, request));
}

async function setHeroCache(request, response) {
  await caches.default.put(new Request(request.url, request), response.clone());
}

export async function handleRandomHero(request, env, corsOrigin) {
  if (request.method !== "GET") {
    return jsonResponse(
      {
        error: "Method Not Allowed",
        message: "该接口仅接受 GET 请求。",
      },
      405,
      corsOrigin,
    );
  }

  const cacheResponse = await getHeroCache(request);
  if (cacheResponse) {
    return cacheResponse;
  }

  const allowed = await checkPixabayRateLimit(request, env);
  if (!allowed) {
    return jsonResponse(
      {
        error: "RATE_LIMITED",
        message: "请求过于频繁，请稍后再试。",
      },
      429,
      corsOrigin,
      {
        "Retry-After": "60",
      },
    );
  }

  if (!env.PIXABAY_API_KEY) {
    return jsonResponse(
      {
        error: "MISSING_PIXABAY_API_KEY",
        message: "缺少 PIXABAY_API_KEY。",
      },
      500,
      corsOrigin,
    );
  }

  const url = new URL(request.url);
  const query = String(url.searchParams.get("q") || "landscape nature")
    .trim()
    .slice(0, 100);
  const perPage = 50;
  const randomPage = Math.floor(Math.random() * 10) + 1;

  const params = new URLSearchParams({
    key: env.PIXABAY_API_KEY,
    q: query,
    lang: "en",
    image_type: "photo",
    orientation: "horizontal",
    category: "nature",
    min_width: "1920",
    min_height: "1080",
    safesearch: "true",
    order: "popular",
    per_page: String(perPage),
    page: String(randomPage),
  });

  try {
    let response = await fetch(`${PIXABAY_API_ENDPOINT}?${params.toString()}`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Pixabay API 请求失败：${response.status}${
          detail ? ` | ${detail}` : ""
        }`,
      );
    }

    let payload = await response.json();

    if (!payload.hits?.length && randomPage !== 1) {
      params.set("page", "1");

      response = await fetch(`${PIXABAY_API_ENDPOINT}?${params.toString()}`, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Pixabay API 回退请求失败：${response.status}`);
      }

      payload = await response.json();
    }

    if (!Array.isArray(payload.hits) || !payload.hits.length) {
      return jsonResponse(
        {
          error: "NO_IMAGES_FOUND",
          message: "没有找到符合条件的图片。",
        },
        404,
        corsOrigin,
      );
    }

    const image = payload.hits[Math.floor(Math.random() * payload.hits.length)];
    const result = jsonResponse(
      {
        id: image.id,
        url:
          image.fullHDURL || image.largeImageURL || image.webformatURL || null,
        previewUrl: image.webformatURL || image.previewURL || null,
        pageUrl: image.pageURL,
        width: image.imageWidth,
        height: image.imageHeight,
        tags: String(image.tags || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        author: {
          name: image.user || null,
          profileImageUrl: image.userImageURL || null,
        },
      },
      200,
      corsOrigin,
      {
        "Cache-Control": [
          "public",
          `max-age=${HERO_CACHE_TTL_SECONDS}`,
          `s-maxage=${HERO_CACHE_TTL_SECONDS}`,
          "stale-while-revalidate=86400",
        ].join(", "),
      },
    );

    await setHeroCache(request, result);
    return result;
  } catch (error) {
    return jsonResponse(
      {
        error: "RANDOM_HERO_FAILED",
        message: String(error?.message || error),
      },
      502,
      corsOrigin,
    );
  }
}
