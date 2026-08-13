import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    ...(process.env.NODE_ENV === 'test'
      ? []
      : [
          TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
              type: 'postgres' as const,
              url:
                configService.get<string>('DATABASE_URL') ??
                'postgresql://meetpoint:meetpoint-local@localhost:5432/meetpoint',
              autoLoadEntities: true,
              synchronize: false,
              migrationsRun: false,
              retryAttempts: 3,
              retryDelay: 1000,
            }),
          }),
        ]),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
