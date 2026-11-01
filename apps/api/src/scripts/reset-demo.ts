import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { loadConfig } from '../config';
import { DATABASE, type DatabaseHandle } from '../db/database';
import { purgeTestTenants } from '../demo/demo-reset';
import { DemoSeedService } from '../demo/demo-seed.service';

// Deletes all synthetic (is_test) tenants and recreates the demo dealership.
// Real tenants are untouched. Pass --no-reseed to only delete.
async function main() {
  const cfg = loadConfig();
  if (cfg.APP_ENV === 'production') throw new Error('Refusing to reset demo data in production');
  const app = await NestFactory.createApplicationContext(AppModule.forRoot({ ...cfg, APP_ENV: 'test' }), {
    logger: ['error', 'warn', 'log'],
  });
  const removed = await purgeTestTenants(app.get<DatabaseHandle>(DATABASE).db);
  console.log(`Removed ${removed} synthetic tenant(s).`);
  if (!process.argv.includes('--no-reseed')) {
    const seeder = app.get(DemoSeedService);
    seeder.writeCredentials(await seeder.seed());
    console.log('Demo dealership recreated.');
  }
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
