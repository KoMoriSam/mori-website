// Isolated local fixtures use the existing local comment store only.
// Production always uploads through GitHub and never reads this module.
export async function storeLocalAttachment(env, origin, { name, mime, size, body }) {
  const id = crypto.randomUUID();
  const key = "attachment:" + id;
  const reader = body.getReader();
  const buffer = new Uint8Array(8 * 1024 * 1024);
  let used = 0;
  let parts = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (let offset = 0; offset < value.length;) {
      const length = Math.min(buffer.length - used, value.length - offset);
      buffer.set(value.subarray(offset, offset + length), used);
      used += length;
      offset += length;
      if (used === buffer.length) {
        await env.LOCAL_COMMENTS.put(`${key}:${parts++}`, buffer);
        used = 0;
      }
    }
  }
  if (used) await env.LOCAL_COMMENTS.put(`${key}:${parts++}`, buffer.slice(0, used));
  await env.LOCAL_COMMENTS.put(key, JSON.stringify({ mime, size, parts }));
  return { url: `${origin}/api/comments/attachments/local/${id}/file.${name.split(".").at(-1).toLowerCase()}` };
}

export async function localAttachment(request, env) {
  const id = new URL(request.url).pathname.split("/").at(-2);
  if (!/^[\da-f-]{36}$/u.test(id) || !["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 404 });
  const key = "attachment:" + id;
  const metadata = await env.LOCAL_COMMENTS.get(key, "json");
  if (!metadata) return new Response(null, { status: 404 });
  let part = 0;
  const stream = new ReadableStream({
    async pull(controller) {
      if (part === metadata.parts) { controller.close(); return; }
      const bytes = await env.LOCAL_COMMENTS.get(`${key}:${part++}`, "arrayBuffer");
      if (!bytes) { controller.error(new Error("Local fixture is missing")); return; }
      controller.enqueue(new Uint8Array(bytes));
    },
  });
  return new Response(request.method === "HEAD" ? null : stream, { headers: {
    "Content-Type": metadata.mime, "Content-Length": String(metadata.size), "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'",
  } });
}
