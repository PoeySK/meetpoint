import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body.service).toBe('server');
        expect(body.timestamp).toEqual(expect.any(String));
        expect(body.dependencies.database.status).toBe('not_configured');
      });
  });

  it('/live remains alive without a configured database', async () => {
    await request(app.getHttpServer())
      .get('/live')
      .expect(200)
      .expect({ status: 'ok', service: 'server' });
    await request(app.getHttpServer())
      .get('/ready')
      .expect(503)
      .expect({
        status: 'not_ready',
        service: 'server',
        dependencies: { database: { status: 'not_configured' } },
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
