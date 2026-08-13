import { NextResponse } from "next/server";
import { config } from "./config";

const MAX_JSON_BYTES = 48_000;

function addAllowedHost(allowed: Set<string>, raw: string | undefined | null) {
  if (!raw) return;
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    if (url.host) allowed.add(url.host.toLowerCase());
  } catch {
    /* skip bad env */
  }
}

/** Browser fetch always sends Origin. Missing Origin is curl / server scripts. */
export function originAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Production browsers send Origin on fetch. Require it so drive-by
    // scripts have to spoof the live host (smoke sends Origin).
    return process.env.NODE_ENV !== "production";
  }
  let host = "";
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }

  const allowed = new Set<string>();
  addAllowedHost(allowed, config.siteUrl);
  addAllowedHost(allowed, process.env.VERCEL_URL);
  addAllowedHost(allowed, process.env.VERCEL_PROJECT_PRODUCTION_URL);
  addAllowedHost(allowed, process.env.VERCEL_BRANCH_URL);
  addAllowedHost(allowed, "https://www.cybersol.org");
  addAllowedHost(allowed, "https://cybersol.org");
  // Apex / www both valid when the configured site host is one of them.
  for (const hostName of [...allowed]) {
    if (hostName.startsWith("www.")) allowed.add(hostName.slice(4));
    else if (hostName && !hostName.startsWith("localhost") && !hostName.startsWith("127.")) {
      allowed.add(`www.${hostName}`);
    }
  }

  // Same-origin: browser Origin matches this request's Host.
  const reqHost = req.headers.get("host")?.split(":")[0]?.toLowerCase();
  if (reqHost && host === reqHost) return true;

  if (process.env.NODE_ENV !== "production") {
    addAllowedHost(allowed, "http://localhost:3000");
    addAllowedHost(allowed, "http://127.0.0.1:3000");
    addAllowedHost(allowed, "http://localhost:3001");
    addAllowedHost(allowed, "http://127.0.0.1:3001");
    // Dev only — Host is attacker-controlled if a proxy forwards it.
    const reqHost = req.headers.get("host");
    if (reqHost) allowed.add(reqHost.toLowerCase());
  }

  return allowed.has(host);
}

export function rejectBadOrigin(req: Request): NextResponse | null {
  if (originAllowed(req)) return null;
  return NextResponse.json({ error: "Forbidden origin." }, { status: 403 });
}

export function apiError(status: number, publicMessage: string, err?: unknown) {
  if (err) console.error(err);
  return NextResponse.json({ error: publicMessage }, { status });
}

export async function readJsonBody(
  req: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse }> {
  const type = req.headers.get("content-type") ?? "";
  if (type && !type.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Expected JSON." }, { status: 415 }),
    };
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Payload too large." }, { status: 413 }),
    };
  }
  const text = await req.text();
  if (text.length > MAX_JSON_BYTES) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Payload too large." }, { status: 413 }),
    };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON." }, { status: 400 }),
    };
  }
}
