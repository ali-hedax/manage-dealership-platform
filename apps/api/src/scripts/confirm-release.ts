import { loadConfig } from '../config';
import { openDatabase } from '../db/database';
import { confirmVersion, runningCommit } from '../releases/releases.service';

// Release step after the health checks passed (docs/RELEASE_GUIDED_WORKFLOW_FA.md):
//   docker exec manage-api-1 node dist/scripts/confirm-release.js
// Numbers the running commit (GIT_COMMIT of this image) once. Running it again for
// the same commit prints the same number; it never changes any other data.
async function main() {
  const commit = process.argv[2] ?? runningCommit();
  if (!commit) throw new Error('GIT_COMMIT is not set in this image; nothing to confirm');
  const cfg = loadConfig();
  const handle = openDatabase(cfg);
  try {
    const r = await confirmVersion(handle.db, commit);
    console.log(JSON.stringify({ version: r.version, commit: commit.slice(0, 12), created: r.created, notes: r.noteKeys }));
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
