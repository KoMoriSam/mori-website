import { fetchJson } from "./http.js";

const HERO_API_URL = import.meta.env.VITE_RANDOM_HERO_API;

export async function fetchRandomHero() {
  const data = await fetchJson(HERO_API_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    errorMessage: "随机背景图请求失败",
  });

  if (!data?.url) {
    throw new Error("接口没有返回可用的图片地址");
  }

  return data;
}
