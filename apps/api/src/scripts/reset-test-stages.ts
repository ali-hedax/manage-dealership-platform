import { Pool } from 'pg';
import { parseArgs, resetTestStages } from '../maintenance/reset-test-stages';

// Task 1: keeps cases and intake, removes trial stages. Dry run by default.
//   node dist/scripts/reset-test-stages.js --tenant CODE --actor USERNAME [--exclude N1,N2]
//   ... --execute --confirm CODE        (only with the owner's explicit approval, after a backup)
// --database NAME points the same server at another database (e.g. a restored rehearsal copy).
async function main() {
  const argv = process.argv.slice(2);
  const options = parseArgs(argv);
  const url = new URL(process.env.DATABASE_URL ?? '');
  const i = argv.indexOf('--database');
  if (i >= 0) url.pathname = `/${argv[i + 1]}`;
  const pool = new Pool({ connectionString: url.href, max: 1 });
  const client = await pool.connect();
  try {
    const report = await resetTestStages(client, options);
    console.log(JSON.stringify({ database: url.pathname.slice(1), ...report }, null, 1));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
