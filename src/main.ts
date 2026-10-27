import './telemetry';

import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = process.env.PORT ?? 3000;
  // Localhost only by default: the server drives a real Cookidoo account and
  // must not be reachable from the local network. Docker sets HOST=0.0.0.0
  // (the port mapping in docker-compose.yml stays bound to 127.0.0.1).
  const host = process.env.HOST?.trim() || '127.0.0.1';
  await app.listen(port, host);
  Logger.log(
    `Cookidoo MCP server listening on http://${host}:${port}/api/mcp`,
    'Bootstrap',
  );
}
bootstrap().catch((error: unknown) => {
  Logger.error('Failed to start Cookidoo MCP server', error, 'Bootstrap');
  process.exit(1);
});
