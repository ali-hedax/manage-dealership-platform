import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { loadConfig } from '../config';
import { DemoSeedService } from '../demo/demo-seed.service';

// Creates the synthetic demo dealership if the database is empty.
async function main() {
  const cfg = loadConfig();
  if (cfg.APP_ENV === 'production') throw new Error('Refusing to seed demo data in production');
  // APP_ENV=test inside the context avoids the development auto-seed hook.
  const app = await NestFactory.createApplicationContext(AppModule.forRoot({ ...cfg, APP_ENV: 'test' }), {
    logger: ['error', 'warn', 'log'],
  });
  const seeder = app.get(DemoSeedService);
  if (await seeder.isSeeded()) {
    console.log('Database already has tenants; nothing seeded. Use db:reset-demo to recreate demo data.');
  } else {
    seeder.writeCredentials(await seeder.seed());
    console.log('Demo dealership created.');
  }
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
