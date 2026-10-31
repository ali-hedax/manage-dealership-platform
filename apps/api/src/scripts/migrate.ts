import { loadConfig } from '../config';
import { openDatabase } from '../db/database';

// Explicit migration step (required in production; take a backup first).
async function main() {
  const cfg = loadConfig();
  const handle = openDatabase(cfg);
  await handle.migrate();
  await handle.close();
  console.log(`Migrations applied (${cfg.DB_DRIVER}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
