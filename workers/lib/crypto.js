const encoder = new TextEncoder();

export async function digestHex(value, algorithm = "SHA-256") {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  const digest = await crypto.subtle.digest(algorithm, bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function sha256Hex(value) {
  return digestHex(value, "SHA-256");
}
