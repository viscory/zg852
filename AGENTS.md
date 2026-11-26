# Project instructions

- At the end of every assistant turn, prepend a timestamped block to `observations.md` summarizing what you learned and did in that round. Never edit, reorder, or delete existing blocks; insert only at the top.
- Run Playwright against the built `public/` output, never the source tree. `npm test` builds and serves `public/` automatically.
- Deployable pages and scripts live in `src/`; files served verbatim live in `static/`; Vite bundles both into `public/`. Do not serve or test the source tree directly.
- Bump the service-worker cache version in `static/sw.js` when changing cached assets, add new bundle files to its asset list, and keep the patch strings in `scripts/finalize.mjs` in sync.
- Keep user-facing copy in `static/i18n/*.json`; treat the text in `src/index.html` as a no-JavaScript fallback only.
- Libraries come from npm and are bundled by Vite. Do not add vendored copies under `vendor/`.
- Shared mutable state lives in the `store` object in `src/js/store.js`; modules own behaviour, the store owns state.
- The recenter control belongs on the map beside the Leaflet zoom control, not in the right sidebar.
- Route-affecting changes must call `scheduleRecompute()` so results update without pressing Search.

## Fast runbook: turn a QA report into a verified fix push

- Scope: when asked to "fix push" after a report, implement **every** numbered finding, add focused regressions, rebuild/verify, then commit and push. Do not re-run the report unless asked.
- Keep exact-English expectations. If a test asserts composed copy (for example `Top 7 areas · fairest first`), add one localized key such as `results.header` rather than changing the rendered string.
- Do **not** add, remove, or narrow `page.route(...)` handlers to make tests pass. Leave every existing test route and network path reachable; never block a route as a shortcut.

### First 10 minutes: inventory in parallel

1. `git status --short`, `git log -3 --oneline`.
2. `npm run lint`. If `HEAD == origin/main` and the worktree is clean, skip the baseline full suite; run it once after the edits.
3. Dispatch parallel explore agents per affected subsystem (for example fares, mobile layout, UI feedback, i18n). Ask each for exact `file:line`, selectors, and test expectations so implementation can start without a second discovery pass.
4. Read the report's evidence as the source of truth for selectors and user-visible symptoms.

### Implementation shortcuts that stay correct

- Add shared UI hooks once (`#actionStatus` live region, `#betaBadgeState` span) and reuse them for all feedback/state findings instead of one-off markup per bug.
- For any new i18n key, update `src/js/i18n.js` FALLBACK **and** all 15 `static/i18n/*.json` catalogues in one pass; `npm run i18n:check` is the gate.
- When catalogue keys change, update hard-coded counts in `tests/e2e.spec.js` (currently 202) and keep dynamic-key lookups exempt from literal scanning.
- When cached assets change, bump `CACHE` in `static/sw.js` and update the expected version in `tests/audit-sw.spec.js`. `scripts/finalize.mjs` only patches the `'./sw.js',` token; there is no version string to sync there.
- Add regressions to the spec that already owns the area (`tests/live-findings-fixes.spec.js`, `tests/mobile.spec.js`) instead of creating a new suite.

### Known time sinks on this codebase

- A shared scenario URL auto-runs Search and flips the sidebar to the route face. To type into a start input either wait for the people face or use the default two-person scenario and type over `#start-p2`; otherwise `#suggest-*` is hidden and suggestion tests fail for the wrong reason.
- `#error` is hidden on mobile (`display:none!important`). Use the shared status live region for visible feedback while keeping the existing `#error` assertion.
- `tests/ui-fixes.spec.js` asserts the translated `.legal-note` text. Add a separate `.legal-summary` node for localized summaries so that expectation remains valid; keep the English body with `lang="en"`.
- `tests/e2e.spec.js` rejects `rank`/`ranked`/`ranking` in any catalogue value; write "sorted" or "ordered" in summary strings.
- Mark **every** `leg.mode==='bus'` fare as estimated even when a snapshot fare exists; ferry behaviour stays unchanged.
- Fix mobile route clipping on `#flipStage` as the nested scroller with `max-height:calc(<dvh> - 28px)`; do not solve it by only enlarging `.side-left`.

### Test and ship

1. Run new/changed tests first: `npx playwright test <file> --grep "<test name>"`.
2. If a test fails, fix the fixture/setup (async search race, wrong sidebar face) rather than weakening the assertion.
3. Run `npm run lint` then `npm test` once against built `public/`.
4. `git status --short`: stage only intended tracked files; leave untracked QA artefacts untouched.
5. Commit implementation and observations log separately, push both, and confirm `git rev-list --left-right --count main...origin/main` is `0 0`.
