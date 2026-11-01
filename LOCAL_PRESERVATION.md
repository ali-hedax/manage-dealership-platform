# Local prototype preservation — 2026-11-01

This branch is based on `feature/b2b-auto-report` (`e55ba16`), not the new Next.js accident-repair application. Commit `e152981` preserves thirteen explicitly reviewed local source/configuration/documentation paths from the owner's prototype checkout. Their original files and staged state were left untouched. No `.local`, real `.env`, report, database, credentials or browser profile was copied.

The preserved changes add editor conventions, shared VS Code tasks/debug configurations, synthetic Node CI, a browser-test script and documentation. Application HTML and companion implementation are unchanged. No automatic merge, server operation, B2B login or production deployment is included.

Validation: `npm test` passed locally on Node 26.8.2 (the fifteen synthetic Node test commands). Added CI runs the same suite on Windows/Node 22. Browser tests were not rerun; the existing autosync browser test still has a known expectation tied to the older reception batching behavior. This branch does not claim real B2B or browser acceptance.

The old `hedax.git` remote name in the copied agent guides is corrected in a follow-up commit to the verified `manage-dealership-platform` remote; the original snapshot remains available in history. Review this PR independently of platform PRs #16–#21. Future migration/retirement of the prototype, PR #1 and filename-rename PR #3 needs an owner decision. Do not merge this root package/configuration over the TypeScript monorepo.
