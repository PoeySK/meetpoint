import { Controller, Get, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @Optional() private readonly dataSource?: DataSource,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async getHealth() {
    const database = await this.getDatabaseHealth();

    return {
      status: database.status === 'up' ? 'ok' : 'degraded',
      service: 'server',
      timestamp: new Date().toISOString(),
      dependencies: {
        database,
      },
    };
  }

  private async getDatabaseHealth(): Promise<{
    status: 'up' | 'down' | 'not_configured';
  }> {
    if (!this.dataSource) {
      return { status: 'not_configured' };
    }

    if (!this.dataSource.isInitialized) {
      return { status: 'down' };
    }

    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up' };
    } catch {
      return { status: 'down' };
    }
  }
}
