import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController readiness', () => {
  const create = (initialized = true) => {
    const query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const source = {
      isInitialized: initialized,
      query,
    } as unknown as DataSource;
    return { controller: new AppController(new AppService(), source), query };
  };
  afterEach(() => jest.useRealTimers());

  it('keeps the root response', () => {
    expect(new AppController(new AppService()).getHello()).toBe('Hello World!');
  });
  it('checks SELECT 1 and reports ready without querying Solver or changing data', async () => {
    const { controller, query } = create();
    expect(await controller.getReadiness()).toEqual({
      status: 'ready',
      service: 'server',
      dependencies: { database: { status: 'up' } },
    });
    expect(query.mock.calls).toEqual([['SELECT 1']]);
  });
  it.each([undefined, false])(
    'rejects an absent or uninitialized source (%s)',
    async (initialized) => {
      const controller =
        initialized === undefined
          ? new AppController(new AppService())
          : create(initialized).controller;
      await expect(controller.getReadiness()).rejects.toBeInstanceOf(
        ServiceUnavailableException
      );
      expect(controller.getLiveness()).toEqual({
        status: 'ok',
        service: 'server',
      });
    }
  );
  it('returns safe failure and recovers after a database error', async () => {
    const { controller, query } = create();
    query.mockRejectedValueOnce(new Error('DATABASE_URL password private SQL'));
    const failure = await controller
      .getReadiness()
      .catch((error: ServiceUnavailableException) => error);
    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect((failure as ServiceUnavailableException).getStatus()).toBe(503);
    expect(JSON.stringify(failure)).not.toMatch(
      /password|DATABASE_URL|private SQL/
    );
    expect(controller.getLiveness().status).toBe('ok');
    expect((await controller.getReadiness()).status).toBe('ready');
  });
  it('bounds timeout and shares the unfinished query until it settles', async () => {
    jest.useFakeTimers();
    const { controller, query } = create();
    let finish!: () => void;
    query.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const first = controller.getHealth();
    const second = controller
      .getReadiness()
      .catch((error: ServiceUnavailableException) => error);
    await jest.advanceTimersByTimeAsync(1000);
    expect((await first).status).toBe('degraded');
    expect(await second).toBeInstanceOf(ServiceUnavailableException);
    await expect(controller.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
    expect(query).toHaveBeenCalledTimes(1);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect((await controller.getReadiness()).status).toBe('ready');
    expect(query).toHaveBeenCalledTimes(2);
  });
});
