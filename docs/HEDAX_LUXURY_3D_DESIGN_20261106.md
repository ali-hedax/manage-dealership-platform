# MANAGE by HEDAX — Luxury Spatial Workspace
Status: design specification only, 2026-11-06. No production change. **Do not merge/deploy without owner approval.**

## North star
A bespoke, cinematic, high-end *operational workspace*, not a car-repair game. The user-approved reference is the dark stone, smoked glass, machined metal and restrained warm light concept shown in the design conversation. Do **not** substitute generic AI-generated bento dashboards, identical rounded KPI cards, emoji icons, neon gradients, or a 3D repair-bay simulation.

## Design system
- Deep obsidian / mineral charcoal base; brushed titanium edges; selectively lit champagne-gold focal controls. Material and light hierarchy matters more than a monochrome palette. Accessibility requires readable high-contrast text and semantic status colors independent of gold.
- Spatial hierarchy: anchored navigation rail; calm information canvas; contextual inspector slides **forward** with perspective and backdrop separation; modals occupy a physically distinct layer. Depth is functional, not ornamental.
- Distinctive custom icon geometry with a coherent optical grid, stroke, corner treatment and selected metallic surfaces. No mixed icon families or random decorative car art.
- Typography: premium Persian RTL type system; tabular numerals; clearly differentiated data density, headings and metadata. Avoid fake Persian text or ornamental content in shipped UI.
- Motion: restrained 140–280 ms for routine transitions; spring only for contextual inspector; no scroll-jacking, permanent tilt, parallax on forms, excessive blur or glow. Reduced-motion fallback.
- Data tables, case forms, parts lists, approvals and daily tracking remain flat, sharp, fast, keyboard accessible and printable. Never sacrifice operational efficiency for visual spectacle.

## Surfaces / rollout
1. Design tokens, material primitives, typography, icons, navigation and interaction contracts. Screenshot reference at 390 / 768 / 1440 widths.
2. Auth and role-based workspace shell; dashboard composition with nonuniform hierarchy, operational alert priority and a genuine information architecture.
3. Case detail with spatial inspector and status timeline; parts workbench, staff workbenches and handoffs, approval prompts.
4. Reports, settings, tables, empty/loading/error states, PWA/mobile adaptation and printer styles.
5. Consistency audit across every existing route and role; no placeholder UI for live functionality.

## Technical architecture
Prefer CSS perspective/transforms and Motion/Framer Motion where appropriate; reserve WebGL for rare illustrative moments, **not** for the primary app shell. Feature-gate the new shell so it can be compared to existing UI; do not change API, schema, RBAC, workflows, data or business logic. Keep logical RTL CSS, progressive enhancement, code splitting and low-end mobile fallbacks. Use asset licensing checks; never commit AI-generated text as live data.

## Delivery / acceptance
- Branch isolated from ongoing phase2 (#53), phase3 (#54), and feature/new-look. Rebase only after owner's release sequence and with conflict review.
- At each milestone: screenshots and video of real browser interactions (not a static mockup), WCAG keyboard/focus/contrast, prefers-reduced-motion, 360/390/768/1440 layout, Persian RTL and number formatting, load and interaction performance, no horizontal overflow, print tests, role visibility and existing e2e.
- Capture baseline and after metrics; use a small GPU budget and avoid continuous animation on idle.
- No merge, migration, deployment, DNS or production edits. Synthetic demo data only.
- Proposed first implementation PR after design review: design tokens + spatial shell + dashboard in isolated branch, with tests and screenshots. This document is **not** a claim that UI implementation or CI testing has happened.

## Dependency / next action
Wait for Saturday operational release and settle latest main before integrating. Then inspect current routes, existing design tokens and screenshots; implement the first vertical slice and run repo checks, preserving all business features.
