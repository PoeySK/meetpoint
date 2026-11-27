import { Controller, Get, Req, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { requireApiProxy, type ApiProxyRequest } from './api-proxy';

@Controller()
class ProbeController {
  @Get('api/v1/probe')
  probe(@Req() req: ApiProxyRequest) {
    return { clientIp: req.proxiedClientIp ?? null };
  }

  @Get('ready')
  ready() {
    return { status: 'ready' };
  }
}

describe('private API proxy access', () => {
  const secret = 'a'.repeat(64);
  let app: INestApplication<App>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();
    app = module.createNestApplication();
    app.use(requireApiProxy(secret));
    await app.init();
  });

  afterAll(async () => app.close());

  it('rejects direct requests and permits the exact readiness check', async () => {
    const api = request(app.getHttpServer());
    await api
      .get('/api/v1/probe')
      .expect('Cache-Control', 'no-store')
      .expect(403);
    await api
      .get('/api/v1/probe')
      .set('X-MeetPoint-Proxy-Secret', 'b'.repeat(64))
      .set('X-MeetPoint-Client-Ip', '192.0.2.1')
      .expect(403);
    await api.get('/ready').expect(200);
    await api.post('/ready').expect(403);
  });

  it('passes the authenticated client IP to rate limiting and discards IP lists', async () => {
    const api = request(app.getHttpServer());
    await api
      .get('/api/v1/probe')
      .set('X-MeetPoint-Proxy-Secret', secret)
      .set('X-MeetPoint-Client-Ip', '2001:db8::1')
      .expect(200, { clientIp: '2001:db8::1' });
    await api
      .get('/api/v1/probe')
      .set('X-MeetPoint-Proxy-Secret', secret)
      .set('X-MeetPoint-Client-Ip', '192.0.2.1, 192.0.2.2')
      .expect(200, { clientIp: null });
  });
});
