import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { trustedProxy } from './config/trusted-proxy';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  const configService = app.get(ConfigService);
  app.set(
    'trust proxy',
    trustedProxy(configService.get<string>('TRUSTED_PROXY_IPS'))
  );
  const clientOrigins = (
    configService.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:10081'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    exposedHeaders: ['Retry-After'],
    credentials: true,
    origin: clientOrigins.length === 1 ? clientOrigins[0] : clientOrigins,
  });

  const port = Number.parseInt(
    configService.get<string>('SERVER_PORT') ??
      configService.get<string>('PORT') ??
      '3001',
    10
  );

  await app.listen(port);
}
void bootstrap();
