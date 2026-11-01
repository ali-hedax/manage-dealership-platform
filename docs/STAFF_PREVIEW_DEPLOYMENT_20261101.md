# Staff Preview release — 2026-11-01

## What is live

The owner explicitly approved merging PR #24 and installing it only on the isolated Manage Preview. Main contains the merge at `2b1bf10909ea459ccca2bbfecfcffd6989b198d4`. Deployed application source is `b7e4c93d5e29053019e359c34a53691d649642f2`.

The کارکنان page supports name/email/roles, invitation delivery status and explicit resend, plus a private-link fallback when email setup is unavailable. New staff choose their own password and enroll their own Google Authenticator. Existing identities, sessions, authentication keys and synthetic cases were preserved; no reset was run. Source, Production, owner DNS and firewall rules were not changed.

## Build and integrity evidence

- The approved app head passed all six jobs in [41320401502](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41320401502); its main merge passed [41320771320](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41320771320).
- Server package-registry/GitHub connections were unreliable. A failed on-host build restored the old code/image tags; existing containers remained healthy. No package build completed or database migration ran during that failed attempt.
- [PR #25](https://github.com/ali-hedax/manage-dealership-platform/pull/25) adds export of already tested Docker images to CI, without server access or automatic deployment. All six jobs passed in [41321155189](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41321155189).
- The imported image archive was built from CI checkout `a61e35ded555e4278c5f2ce8c3c06fa215df71b5`. Its application, dependencies, Docker/Compose and deployment sources were compared to the approved app head and are identical; only CI configuration differs. Archive SHA-256 was verified on both transfer ends, and imported image IDs matched the CI manifest. No temporary signed download URL or credential is published.

## Safe installation and live checks

Before the successful update, a fresh private DB/config backup was saved with restricted permissions and its archive listing checked. Previous application images were retained for rollback. Only API and web were replaced using imported images, without compiling on the VM, resetting Git history, pruning images, deleting data, rebuilding the database or replacing Caddy/gate.

The additive `0006_staff_invitation_email` migration was verified by checking both new columns. API/web/database/gate health passed, trusted HTTPS login returned 200, personal-auth options remained enabled, and anonymous invitation API access returned 401. Anonymous `/users` redirects to login, as intended. The environment file remained byte-for-byte identical to its pre-update backup. The application checkout is clean at the approved SHA. An authenticated live staff invitation has not yet been exercised by the owner; no staff identity was invented or added to the live DB by this audit.

## Email status — explicitly incomplete

The owner privately created and saved a Gmail App Password. Local SMTP authentication succeeded. With explicit permission, one simple test message was accepted by Gmail **from the owner's local machine**, with no invitation link or password in the message. This is not claimed as server-side SMTP success or confirmed inbox delivery.

The VM's connections to Gmail on 465 and 587 timed out, including a separately resolved public Google endpoint. Host UFW allows outgoing and its OUTPUT policy is ACCEPT. This does not establish which upstream policy/routing condition is responsible. The private sender settings have not been loaded into the live API, so automatic invitation email is not presented as ready. Private-link onboarding is available now.

Track server connectivity, approved sender configuration and a real server-originated invitation in [issue #26](https://github.com/ali-hedax/manage-dealership-platform/issues/26). Do not bypass TLS verification or publish keys to work around networking. The user's normal Google password is not needed by the application.
