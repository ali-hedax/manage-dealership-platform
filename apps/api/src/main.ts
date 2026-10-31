import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { loadConfig } from './config';

async function main() {
  const cfg = loadConfig();
  const app = await NestFactory.create(AppModule.forRoot(cfg), { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app, cfg);
  await app.listen(cfg.API_PORT);
  app.get(Logger).log(`Manage API listening on :${cfg.API_PORT} (${cfg.APP_ENV}, db=${cfg.DB_DRIVER})`);
}

void main();
