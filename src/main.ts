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
  // Also write synchronously to stderr: the logger is asynchronous, and the
  // message would otherwise be lost when the process exits right away.
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  const hint =
    code === 'EADDRINUSE'
      ? `Le port ${process.env.PORT ?? 3000} est déjà utilisé : le serveur Cookidoo tourne sans doute déjà ` +
        '(une autre fenêtre « Cookidoo MCP » ouverte ?). Ferme-la ou garde celle-ci.'
      : "Le serveur Cookidoo n'a pas pu démarrer.";
  process.stderr.write(
    `\n[ERREUR] ${hint}\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
  // Leave a moment for the logs to be flushed before exiting.
  setTimeout(() => process.exit(1), 500).unref();
});
