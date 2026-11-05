# Entry and operational navigation review — 2026-11-05

Owner scope: declutter duplicate case-stock selectors and search flags; refine login and add an explicit permitted-desk landing page; review operational navigation and case sections. Owner explicitly authorized publication of this set without another approval prompt. Additional calendar request was clarified as **Iran holiday updates only**, not personal-calendar scheduling. No main merge, domain, email, Source, new role grant or business-data edit is included.

## Design decisions

- Retain the actual Manage logo and Persian Vazirmatn. Carbon `#1a202c`, slate `#4a5568`, blue `#3182ce`, stronger blue `#2b6cb0`, paper `#f5f7fa`, white `#ffffff`. Existing app tokens remain authoritative.
- Login: one strong brand surface with the actual acceptance-to-delivery route, beside a quiet credential form. No marketing counters, stock photos, motion or new dependencies. Preserve password-manager support, Authenticator, install instructions and safe explicit return URLs.
- Landing: account greeting, dealership identity, then only permitted desks. Technician gets one clear entry to assigned jobs. A single persistent menu destination lets everyone return to selection. Remove the second repeated list of desk links in the sidebar; keep operational destinations and notifications.
- Case search: search remains immediate; secondary criteria sit behind native disclosure. Applied criteria remain visible with a clear action. URL and page reset behavior preserved.
- Case parts: stock options and exact-code reservation are next to their actual PartRequest. Draft assessment lines remain read-only previews. No inferred substitution, automatic reservation or permission expansion. The lower all-parts selector is removed; history remains available.

The design search's first automotive result recommended motion and Latin display fonts; these do not fit a Persian operational product. A narrower enterprise query supports restrained spacing and contrast. Existing brand and field work take precedence over marketing-page patterns.

## Calendar boundary

Read-only server fetch from a fixed public Google Iran ICS URL; no OAuth, personal calendar or customer payload. Restrict response size, timeout and redirects; cache the shared public feed for one hour. Parse expanded all-day Public holiday records, exclude Observance/cancelled entries, flag tentative dates and deduplicate dates. Fail rather than silently accepting unsupported recurrence or invalid dates. Persian labels cover known feed names; unknown titles remain identifiable.

Settings fetch on opening, focus and hourly while open, with an explicit fresh-read action. Applying reviewed suggestions changes a draft; the existing versioned/audited calendar save activates it. Tentative dates require explicit selection. Preserve manual closures and working hours; refresh replaces only future Google-sourced draft dates. Do not automatically extend the verified horizon or recalculate previous task snapshots. Google is an updating secondary source, not a guarantee of emergency closure announcements. Offline/background synchronization is not claimed.

Deployment-network check: the owner's Windows machine fetched the public feed (HTTP 200); the dedicated Manage host and API container timed out against both calendar.google.com and www.google.com. No firewall/DNS/proxy change was attempted. A local `.ics` fallback reads Google's downloaded Iran feed in the browser using the same parser (2 MB bound, Iran calendar-name check); only reviewed holiday rows enter the normal audited save. Direct server refresh must not be described as operational until connectivity is restored and tested. This is separate from delivery of the UI redesign.

## Review evidence

Local synthetic browser traversal covers entry, dashboard, six operational desks, case list/intake/import, workshop/calendar, reports, daily files, stock, Emdad, staff and reference data; every seeded case opens and its sections toggle. Existing owner/access, technician, finance and reservation flows remain required release gates. Live checks are read-only; never create purchases, payments, repairs or approvals to prove UI.

Results and remaining work are recorded in [TEST_REPORT.md](TEST_REPORT.md) and [../PROGRESS.md](../PROGRESS.md). Production evidence will be appended after verified publication.

Pre-publication live read-only review: all 17 current cases loaded, each with nine operational disclosure sections; six repeated selector rows were present in the old production UI. No case, reservation, purchase, payment, task, approval or personal permission was changed during this review.

Published `ad54f15` with all six CI checks passing and verified preservation/restores; [release evidence](RELEASE_ENTRY_20261105.md). Live owner landing, folded filters and per-part reserve access confirmed. Direct Google network access remains the explicit outstanding limitation.
