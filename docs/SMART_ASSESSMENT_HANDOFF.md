# Smart manual assessment — first implementation slice (2026-11-18)

Branch: `feature/smart-assessment-persian-search` (independent of ongoing VS Code branches).

## Owner-approved journey
- Case context supplies vehicle/model/trim/VIN. For now the accident expert enters items; the architecture should later permit technician proposals without granting technician approval rights.
- Type a colloquial Persian part name or technical code, see a keyboard-friendly dropdown of **actual catalog** names + codes filtered/ranked for the case vehicle, select, and immediately focus the search input for the next item.
- Review / return only disputed lines to accident expert with reason; send approved lines into the **existing single case parts list**, never invent a parallel list.
- Golden Card Excel import continues unchanged. Insurance, private-pay and body-replacement cases can use manual entry. Labor is separate from procurable parts.
- Same technical code already on case: adjust quantity instead of silently making duplicate lines. Preserve audit trail, tenant isolation, permissions and expectedVersion.

## Implemented in this branch
- Pure shared ranking utility with Persian/Arabic character normalization, digit normalization, joined/separated/ZWNJ search, aliases, exact/partial code matching, limited typo tolerance, capped results, and explicit unknown fitment flag.
- Unit tests with synthetic sample parts only.
- **Not wired to a real catalog/API/UI yet.** No customer data, production access, schema migration, or deployment.

## Next steps for VS Code agent
1. Inspect existing case assessment endpoints, catalog/price-list storage, and real vehicle applicability linkage before choosing a query implementation. Do **not** infer compatible parts just from name; if applicability is missing, mark suggestions `unknown` and require the expert/parts manager to confirm.
2. Build tenant-scoped, permission-guarded, paginated catalog suggestions endpoint; database-level filters first, rank bounded candidates using `rankAssessmentCandidates`. Do not fetch the entire catalog client-side.
3. Add Persian RTL typeahead to the existing case assessment editor, with arrow/Enter controls, loading/empty states, preserved part code, quantity and quick successive entry.
4. Reuse existing assessment/parts mutation contracts, transaction + audit/outbox, deduping and version locking. No direct writes from suggestions endpoint.
5. Design a per-line review and return workflow integrated with parts manager, without blocking approved lines. Add authorization and regression tests.
6. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` and suitable Playwright checks. Document results in `docs/TEST_REPORT.md`, update PROGRESS/CHANGELOG when application behavior changes. Open a draft PR; do not merge or publish without explicit approval.

## UX guardrails
- Make 100 sequential entries feasible; after add, reset input and autofocus it.
- Preserve original search label but display actual official catalog title + complete part number.
- Display a warning for unknown vehicle fitment; never represent similarity score as confirmed compatibility.
- No model-generated part number or automatic financial/insurance authorization.
