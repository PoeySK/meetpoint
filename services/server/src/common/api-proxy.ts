import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request, RequestHandler } from 'express';

export type ApiProxyRequest = Request & { proxiedClientIp?: string };

export function requireApiProxy(secret: string): RequestHandler {
  const expected = Buffer.from(secret);

  return (request: ApiProxyRequest, response, next) => {
    // The private Compose health check only requests readiness.
    if (request.method === 'GET' && request.path === '/ready') {
      next();
      return;
    }

    const received = Buffer.from(request.get('x-meetpoint-proxy-secret') ?? '');
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      response.set('Cache-Control', 'no-store').sendStatus(403);
      return;
    }

    const clientIp = request.get('x-meetpoint-client-ip');
    if (clientIp && isIP(clientIp)) request.proxiedClientIp = clientIp;
    next();
  };
}
