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
- Read-only case-scoped API endpoint now added: `POST /api/v1/cases/:id/assessment-catalog/search` with `{ "query": "سپر" }`; it searches the existing imported `reference_entries` parts catalog, filters by tenant, checks case access and ranks a bounded sample of candidates. Returns official names, part numbers, vehicle-use hint and `fitmentVerified: false`.
- The insurance/personal draft assessment now displays `SmartAssessmentEntry`: a debounced combobox with keyboard navigation, quantity, read-only case-scoped suggestions, and sequential, versioned writes through the existing assessment-items API. Existing Excel import is unaffected. Duplicate part codes are blocked in quick entry and directed to existing item editing.\n- **Still needs end-to-end integration validation on synthetic data and a parts-manager return/correction workflow.** Free-text `vehicleUse` is NOT authoritative fitment. The bounded prefilter is an initial implementation and needs performance/fuzzy-search improvements for a very large catalog. No customer data, production access, schema migration, or deployment.

## Next steps for VS Code agent
1. Validate the new case-scoped endpoint against synthetic imported reference parts and authorized/unauthorized case actors, including wrong-tenant requests, large catalog search and Persian join/spacing variants. Verify available permissions for accident experts. Do **not** infer compatibility from free-text vehicleUse; keep `unknown` pending authoritative fitment metadata.
2. Improve prefilter coverage and index/performance for large catalogs and synonyms; add pagination if needed, rather than fetching the full catalog client-side.
3. Run a synthetic browser E2E for the new typeahead: search, arrow/Enter, add two items in succession, refresh persistence, duplicate protection, empty results, stale version conflict, and unauthorized tenant. Improve accessibility and search performance as needed.
4. Reuse existing assessment/parts mutation contracts, transaction + audit/outbox, deduping and version locking. No direct writes from suggestions endpoint.
5. Design a per-line review and return workflow integrated with parts manager, without blocking approved lines. Add authorization and regression tests.
6. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` and suitable Playwright checks. Document results in `docs/TEST_REPORT.md`, update PROGRESS/CHANGELOG when application behavior changes. Open a draft PR; do not merge or publish without explicit approval.

## UX guardrails
- Make 100 sequential entries feasible; after add, reset input and autofocus it.
- Preserve original search label but display actual official catalog title + complete part number.
- Display a warning for unknown vehicle fitment; never represent similarity score as confirmed compatibility.
- No model-generated part number or automatic financial/insurance authorization.

## Independent parts-clerk technical review foundation (2026-11-18)
- New shared pure engine `assessment-part-review.ts` models `pending`, `accepted`, and `returned` separately from insurer/OEM authorization and existing `approvalStatus`.
- For each part: return requires a reason, optimistic expected version is validated, acceptance becomes pending when its technical code / name / quantity fingerprint changes, and labour is excluded.
- `technicalReviewSummary` can release the 95 accepted item IDs while returning five disputed item IDs for correction; synthetic unit tests cover this scenario.
- **Not yet operational:** no review database table or migration, server review endpoint, parts-clerk UI, audit trail, notifications or enforcement on dispatch. Do not show these draft review states as production approvals. Before integration, inspect current main changes and preserve existing supply authorizations; review storage, transactional audit, tenant isolation, role enforcement and per-line dispatch gating are required.
- The newest PR commits after the successful run `44260852930` have **not been verified by CI**. Earlier CI success is not proof these newer code paths pass.

## Parts-clerk technical review UI and persistence (2026-11-18)

Implemented in this branch only:
- Migration 0028 creates `assessment_technical_reviews` keyed by assessment item; status, reason, reviewer, date, fingerprint and record version persist independently from insurer/OEM approvals. Migration journal and rollback SQL are included.
- `GET /api/v1/cases/:id/technical-reviews` returns review statuses for draft part lines after case-tenant authorization. `POST /api/v1/assessment-items/:id/technical-review` requires `part.manage`, validates the expected review version and reason for returns, and writes state and audit/change-log in one transaction.
- Editing a technical code, quantity, action or description through the existing item edit API resets old technical acceptance with an audit entry. The review UI also supports explicit reset if a different import path made the stored fingerprint stale.
- `TechnicalReviewPanel` shows independent buttons and reasons to parts clerks and read-only status to the accident expert inside draft insurance/personal assessments. Synthetic API and Playwright tests were committed, but their latest-run results are not verified here.

**Important current boundary:** technical review status is not yet a server-enforced requirement for dispatching parts to the existing procurement list; do not imply that pressing “accept” sends a part, or that “return” automatically blocks purchasing. Before enabling the feature for staff, add guarded per-item dispatch behavior with backward compatibility for existing Golden Card workflows, check all permissions and migrations on a disposable synthetic database, and pass the full CI matrix. No merge, production migration or deployment was performed.
