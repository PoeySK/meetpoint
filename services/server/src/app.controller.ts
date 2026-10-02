import {
  Controller,
  Get,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppService } from './app.service';

type DatabaseHealth = { status: 'up' | 'down' | 'not_configured' };
const CHECK_TIMEOUT_MS = 1000;

@Controller()
export class AppController {
  private databaseCheck?: Promise<DatabaseHealth>;

  constructor(
    private readonly appService: AppService,
    @Optional() private readonly dataSource?: DataSource
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('live')
  getLiveness() {
    return { status: 'ok', service: 'server' };
  }

  @Get('health')
  async getHealth() {
    const database = await this.getDatabaseHealth();
    return {
      status: database.status === 'up' ? 'ok' : 'degraded',
      service: 'server',
      timestamp: new Date().toISOString(),
      dependencies: { database },
    };
  }

  @Get('ready')
  async getReadiness() {
    const database = await this.getDatabaseHealth();
    const response = {
      status: database.status === 'up' ? 'ready' : 'not_ready',
      service: 'server',
      dependencies: { database },
    };
    if (database.status !== 'up')
      throw new ServiceUnavailableException(response);
    return response;
  }

  private getDatabaseHealth(): Promise<DatabaseHealth> {
    if (!this.dataSource) return Promise.resolve({ status: 'not_configured' });
    if (!this.dataSource.isInitialized)
      return Promise.resolve({ status: 'down' });
    if (this.databaseCheck) return this.databaseCheck;

    const query = this.dataSource.query('SELECT 1');
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<DatabaseHealth>((resolve) => {
      timer = setTimeout(() => resolve({ status: 'down' }), CHECK_TIMEOUT_MS);
    });
    const result = query.then<DatabaseHealth, DatabaseHealth>(
      () => ({ status: 'up' }),
      () => ({ status: 'down' })
    );
    this.databaseCheck = Promise.race([result, timeout]);
    // 응답 제한이 쿼리를 취소하지 않으므로 실제 종료 전에는 새 검사를 시작하지 않는다.
    void result.then(() => {
      clearTimeout(timer);
      this.databaseCheck = undefined;
    });
    return this.databaseCheck;
  }
}
