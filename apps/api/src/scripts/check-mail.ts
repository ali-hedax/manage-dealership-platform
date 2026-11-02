import { InvitationMailService } from '../auth/invitation-mail.service';
import { loadConfig } from '../config';

// Checks the SMTP settings in the environment (connection, TLS, sender
// authentication) without sending a message. Used by
// deploy/preview/configure-smtp.sh before settings are enabled. Prints only
// the result category; never the raw error, which can contain credentials.
async function main() {
  const cfg = loadConfig({ APP_ENV: 'test', TOTP_AUTH_ENABLED: 'false', DB_DRIVER: 'pglite' });
  const result = await new InvitationMailService(cfg).check();
  console.log(`mail-check: ${result.status === 'failed' ? result.failure : result.status}`);
  process.exitCode = result.status === 'ready' ? 0 : 2;
}
main().catch(() => {
  console.log('mail-check: unknown');
  process.exitCode = 2;
});
