import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from '../config';
import { PulseWorkerModule } from './pulse-worker';

// Entry point of the Manage Pulse worker (compose service `pulse`, same image as the API):
//   node dist/pulse/main.js
// A Nest application context without an HTTP server. Stopping it never affects the API or web.
async function main() {
  const cfg = loadConfig();
  const app = await NestFactory.createApplicationContext(PulseWorkerModule.forRoot(cfg), { logger: ['log', 'warn', 'error'] });
  app.enableShutdownHooks();
}

void main();
