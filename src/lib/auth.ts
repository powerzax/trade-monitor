export const AUTH_COOKIE = "tm_auth";
export const AUTH_MAX_AGE = 180 * 24 * 3600;

// The cookie holds an HMAC of a fixed label keyed by the PIN, so changing APP_PIN signs everyone out.
export async function sessionToken(pin: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(`tm:${pin}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("trade-monitor-session-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
