type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  if (buckets.size > 4000) {
    for (const [k, v] of buckets) {
      if (v.resetAt < now) buckets.delete(k);
    }
  }
  if (buckets.size > 4000) {
    let dropped = 0;
    for (const k of buckets.keys()) {
      buckets.delete(k);
      dropped += 1;
      if (dropped >= 500) break;
    }
  }
  const hit = buckets.get(key);
  if (!hit || hit.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (hit.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((hit.resetAt - now) / 1000)) };
  }
  hit.count += 1;
  return { ok: true };
}

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-fA-F:]+$/;

function cleanIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ip = raw.split(",")[0]?.trim() ?? "";
  if (!ip || ip.length > 45) return null;
  if (IPV4.test(ip) || (ip.includes(":") && IPV6.test(ip))) return ip;
  return null;
}

/**
 * Prefer platform-set headers. Never trust `cf-connecting-ip` on Vercel unless
 * Cloudflare actually sits in front (`TRUST_CF_CONNECTING_IP=true` / CF Pages) —
 * clients can otherwise spoof it and mint a fresh rate-limit bucket per request.
 */
export function clientIp(req: Request): string {
  const vercel = cleanIp(req.headers.get("x-vercel-forwarded-for"));
  if (vercel) return vercel;

  if (process.env.CF_PAGES || process.env.TRUST_CF_CONNECTING_IP === "true") {
    const cf = cleanIp(req.headers.get("cf-connecting-ip"));
    if (cf) return cf;
  }

  if (process.env.TRUST_PROXY === "true") {
    const real = cleanIp(req.headers.get("x-real-ip"));
    if (real) return real;
    const fwd = cleanIp(req.headers.get("x-forwarded-for"));
    if (fwd) return fwd;
  }

  return "unknown";
}
