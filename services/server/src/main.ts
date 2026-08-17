import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const clientOrigins = (
    configService.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
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
