import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import configuredSource from '../src/database/data-source';

describe('Readiness with isolated PostgreSQL', () => {
  let app: INestApplication<App>;
  let source: DataSource;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (!/^meetpoint_recovery_test_[a-f0-9]{16}$/.test(url.pathname.slice(1)))
      throw new Error('Readiness integration requires an isolated database.');
    source = new DataSource(configuredSource.options);
    await source.initialize();
    const module = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: DataSource, useValue: source }],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    if (source?.isInitialized) await source.destroy();
  });
  it('reports 503 during connection loss and 200 after its own source reconnects', async () => {
    await request(app.getHttpServer()).get('/ready').expect(200);
    await source.destroy();
    await request(app.getHttpServer()).get('/ready').expect(503);
    await request(app.getHttpServer()).get('/live').expect(200);
    await source.initialize();
    await request(app.getHttpServer())
      .get('/ready')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          status: 'ready',
          service: 'server',
          dependencies: { database: { status: 'up' } },
        });
      });
  });
  it('bounds a slow real query, preserves persisted state and recovers when it finishes', async () => {
    const query = source.query.bind(source);
    const state = async () =>
      Promise.all(
        ['rooms', 'calculation_jobs', 'score_results'].map((table) =>
          query(`SELECT id, status FROM ${table} ORDER BY id`)
        )
      );
    const before = await state();
    const pending = query('SELECT pg_sleep(1.2)');
    const spy = jest
      .spyOn(source, 'query')
      .mockImplementationOnce(() => pending);
    try {
      await request(app.getHttpServer()).get('/ready').expect(503);
      await request(app.getHttpServer()).get('/live').expect(200);
      await pending;
      await request(app.getHttpServer()).get('/ready').expect(200);
      expect(await state()).toEqual(before);
    } finally {
      spy.mockRestore();
    }
  });
});
