import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { RoomApiErrorPayload } from "@/shared/api/http-client";

export const runtime = "nodejs";

const requestHeaders = ["accept", "authorization", "content-type", "cookie", "if-match-version", "origin"];
const responseHeaders = ["content-type", "retry-after"];
const internalApiOrigin = "http://server:3001";

function proxyError(status: number, code: string, message: string) {
  const payload: RoomApiErrorPayload = {
    error: { code, message, details: {}, requestId: `req_${randomUUID()}` },
  };
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

async function forward(request: Request): Promise<Response> {
  const secret = process.env.API_PROXY_SHARED_SECRET;
  if (!secret || !/^[0-9a-f]{64}$/.test(secret)) {
    return proxyError(503, "API_PROXY_UNAVAILABLE", "API 연결 설정을 확인해 주세요.");
  }

  const { pathname, search } = new URL(request.url);
  if (!/^\/api\/v1\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\/?$/i.test(pathname)) {
    return proxyError(404, "RESOURCE_NOT_FOUND", "요청 경로를 찾을 수 없습니다.");
  }
  const upstream = new URL(internalApiOrigin);
  upstream.pathname = pathname;
  upstream.search = search;

  const headers = new Headers({ "x-meetpoint-proxy-secret": secret });
  for (const name of requestHeaders) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  // The private ingress overwrites this header with the PROXY protocol address.
  const clientIp = request.headers.get("x-meetpoint-client-ip");
  if (clientIp && isIP(clientIp)) headers.set("x-meetpoint-client-ip", clientIp);

  try {
    const result = await fetch(upstream, {
      method: request.method,
      headers,
      body: request.body ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });

    const outgoing = new Headers({ "Cache-Control": "no-store" });
    for (const name of responseHeaders) {
      const value = result.headers.get(name);
      if (value !== null) outgoing.set(name, value);
    }
    for (const cookie of result.headers.getSetCookie()) outgoing.append("Set-Cookie", cookie);

    return new Response(result.body, { status: result.status, headers: outgoing });
  } catch {
    return proxyError(502, "API_UPSTREAM_UNAVAILABLE", "서비스에 연결할 수 없습니다.");
  }
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
