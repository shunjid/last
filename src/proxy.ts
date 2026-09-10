import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

const PORT = process.env.PORT ?? "4123";
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`]);
const ALLOWED_ORIGINS = new Set([
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
  `http://[::1]:${PORT}`,
]);
const ALLOWED_MODES = new Set(["cors", "same-origin"]);
const SAFE_METHODS = new Set(["GET", "HEAD"]);
const IS_DEV = process.env.NODE_ENV === "development";

function forbid(reason: string) {
  return new NextResponse(JSON.stringify({ error: "forbidden", reason }), {
    status: 403,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

function hostIsAllowed(request: NextRequest) {
  const host = request.headers.get("host");
  return Boolean(host && ALLOWED_HOSTS.has(host.toLowerCase()));
}

function guardApi(request: NextRequest): NextResponse | null {
  if (!hostIsAllowed(request)) return forbid("host");

  if (request.method === "OPTIONS") return forbid("preflight");

  const site = request.headers.get("sec-fetch-site");
  if (site !== "same-origin") return forbid("sec-fetch-site");

  const mode = request.headers.get("sec-fetch-mode");
  if (!mode || !ALLOWED_MODES.has(mode)) return forbid("sec-fetch-mode");

  const dest = request.headers.get("sec-fetch-dest");
  if (dest !== "empty") return forbid("sec-fetch-dest");

  if (SAFE_METHODS.has(request.method)) return null;

  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin.toLowerCase())) return forbid("origin");

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) return forbid("content-type");

  return null;
}

function buildCsp(nonce: string) {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    IS_DEV ? "'unsafe-eval'" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const connectSrc = ["'self'", IS_DEV ? `ws://127.0.0.1:${PORT} ws://localhost:${PORT}` : ""]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "worker-src 'self' blob:",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next/image")) return forbid("image-optimizer-disabled");

  if (pathname.startsWith("/api/")) {
    const blocked = guardApi(request);
    if (blocked) return blocked;

    const response = NextResponse.next();
    response.headers.set("cache-control", "no-store, max-age=0");
    response.headers.set("x-content-type-options", "nosniff");
    response.headers.set("cross-origin-resource-policy", "same-origin");
    return response;
  }

  if (!hostIsAllowed(request)) return forbid("host");

  const nonce = randomBytes(18).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|favicon.ico).*)"],
};
