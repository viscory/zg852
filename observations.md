## 2026-11-23T01:33:00Z

- Executed the security fixes from the audit, user said "execute".
- Corrected the audit: a strict Content-Security-Policy already ships. `scripts/finalize.mjs` writes `public/_headers` with `script-src 'self'`, so the crafted-link payload could not run script on the live deploy. The code fixes stay primary.
- `normalizePerson` (`src/js/state.js`) now always generates the person id (`p${i+1}`) and rejects coordinate origins outside `HK_BBOX`. This closes the unescaped `id` injection in the `makeCard` template.
- `HK_BBOX` in `src/js/config.js` is now a numeric array; `HK_BBOX_STR` serves the Photon `bbox` parameter in `src/js/search.js`.
- `src/js/map.js` wraps both `bindTooltip` strings in the existing `esc()`. Leaflet treats string tooltip content as HTML.
- Bumped the service-worker cache to `zg852-v19` for the changed bundle. `finalize.mjs` patch strings were unaffected.
- `tests/production-smoke.spec.js` now reads the cache name from `static/sw.js` and passes it into `page.evaluate` as an argument, so future version bumps do not rebreak the test.
- Verified against the built `public/` output with a crafted `#s=` link carrying `<img src=x onerror=...>` in both `id` and `name`: zero `onerror` attributes, no raw `<img` tag in cards or tooltip, tooltip shows the payload as text, no script executed.
- Full Playwright suite green: 43 passed. Changes left uncommitted.

## 2026-11-23T01:31:00Z

- Ran a poteto-mode security audit of the whole app; read all `src/` modules, `sw.js`, and `wrangler.toml`.
- Confirmed the app has no backend and no mutations. All network calls are GETs: Photon place search, OpenFreeMap tiles, same-origin data and i18n files.
- Found one real attack class: the shared `#s=` URL state is attacker controlled. Two fields reach HTML unescaped.
  - `person.id` is kept from the hash in `normalizePerson` and injected unescaped into the `makeCard` template (`ui.js` `id="name-${id}"` and similar).
  - `person.name` reaches Leaflet `bindTooltip` as HTML at `map.js:89` and `map.js:192`; Leaflet treats string tooltip content as HTML.
- Fixes chosen: stop trusting `raw.id` in `normalizePerson` (always generate), and wrap tooltip strings with the existing `esc()`.
- Lower priority: `openLegal` assigns fetched HTML to `body.innerHTML` (first-party static files only); no Content-Security-Policy is set; shared origin lat/lon only pass `isNum`, with no bounds check.
- Verified healthy paths: Photon query uses `URLSearchParams`; all other user text renders through `esc()`; localStorage restore paths clamp and whitelist; `sw.js` serves same-origin GETs only; legal page kind is whitelisted.

## 2026-11-23T01:32:00Z

- Executed the audit plan: deleted the dead `/vendor/lucide/` service-worker branch and the stale `vendor/**` eslint ignore.
- Added caches: `Intl.NumberFormat`/`PluralRules` per locale, lowercase node names from `loadNodes`, and a memoized `districtFor`.
- Deduplicated: one `cellToResult` for engine and map, one `buildSettings`/`nextSeq` for restore paths, one `commitPeople` for the six render-save-recompute sites, one `setLabel` for the tooltip trio, one `normFocus`.
- Fares now compute once per route inside `describe`; `prepareRoutes` no longer recomputes.
- Cached Dijkstra solutions keyed by origins, mode mask, and budget; tolerance-only changes skip `solve`.
- Measured with an interleaved Playwright probe (7 runs per side): tolerance recompute p50 191 ms to 42 ms; budget recompute p50 191 ms, unchanged. Control path confirms Dijkstra was the limiter.
- Baseline and post-change Playwright suites both green at 43 passed.

## 2026-11-23T09:27:00+08:00

- Read README, CREDITS.md, tests, and static layout to learn the live surface of zg852.pages.dev.
- Wrote a long audit system prompt for a fresh agent to report all live-deploy issues.
- Prompt covers A–O audit areas: load, core journey, routing sanity, search, i18n (15 locales), PWA/sw, performance, a11y, mobile, SEO, legal, data integrity, console sweep, storage.
- Prompt enforces evidence rules, severity + confidence scale, fixed report format, read-only repo access, and the TEST_BASE_URL smoke run.

## 2026-11-23T01:30:00Z

- Ran a read-only Investigation sweep of the whole app: every module in `src/js/`, `app.js`, `index.html`, `sw.js`, and `finalize.mjs`, with call paths traced across modules.
- Found the duplicate cell-to-result mapping in `engine.js` compute and `map.js` buildResultFromCell; extraction into one helper is the top dedup candidate.
- Found fares computed three times per route: twice inside `describe` and once more in `prepareRoutes`.
- Found the biggest latency win: a tolerance-slider change re-runs Dijkstra `solve`, but `solve` depends only on sources, mode mask, and budget, not tolerance, so cached grids could skip it.
- Found easy wins: cache `Intl.NumberFormat`/`PluralRules` per locale, precompute lowercase node names for `searchPlaces`, memoize `districtFor`, debounce `localStorage` writes, and remove the dead `/vendor/lucide/` branch in `sw.js`.
- Confirmed existing caches work well: Photon geoCache, network and POI load guards, i18n catalogs.

## 2026-11-23T01:26:00Z

- Learned the brand's Chinese name is 就腳 (Jyutping zau6 goek3), not 擇角; replaced it and the Mandarin pinyin bracket across all 15 catalogs, pages, legal documents, SEO files, and tests.
- Learned every `vendor/` file was an unpatched or import-only copy of an npm package, so the vendored tree was safe to delete.
- Migrated the build to Vite: `src/` is the app root, `static/` holds served-verbatim files, `app.js` and `app.css` are minified bundles, and Lucide icons from `lucide-static` are inlined into the stylesheet as data URIs; deleted the 2.2 MB `vendor/` tree.
- Rewrote legal pages to share `src/legal.css` instead of inline `<style>` blocks, which the production CSP (`style-src 'self'`) was blocking.
- Found and fixed a deploy bloat bug: the 19 MB raw GTFS feed and the unused 7.4 MB `graph.json` were being copied into `public/`; `scripts/finalize.mjs` now enforces a deploy allowlist, cutting the payload from 32 MB to 6.1 MB.
- Copied `maplibre-gl-worker.mjs` next to the bundle because bundled maplibre-gl resolves its worker relative to the bundle URL.
- Extended CI: test job (lint + build + Playwright) plus a `deploy` job that publishes every green push to `main` via wrangler; it needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
- Bumped the service-worker cache to `zg852-v18`, updated its precache list for the bundle layout, and reworked source-text tests for minified output.
- Added critical-path tests: service-worker precache contents, Photon-outage fallback message, and budget-change auto-recompute.
- Refreshed icon styling: `--icon` size token, unified per-context sizes, and hover/press transitions on icon buttons and chips.
- Verified: `npm run lint` clean and `npm test` passes all 43 tests.

## 2026-11-23T01:16:00Z

- Learned the repo is a no-backend static site: dense 1284-line `app.js`, Python GTFS/POI pipeline, Cloudflare Pages build with `_headers`, and 40 Playwright tests that already ran against the built artifact.
- Reorganized for production: moved all deployable sources into `src/`, split `app.js` into 12 focused modules under `src/js/` with a single `store` for shared mutable state, and isolated the routing engine (solver, fares, leg narration, fair cells) in `src/js/routing.js`.
- Moved `build_graph.py` and `build_poi_index.py` into `scripts/` and fixed their repo-root path resolution.
- Updated `scripts/build-pages.mjs` for the `src/` layout, added a `/js/*` no-cache header rule, bumped the service-worker cache to `zg852-v17`, and added the new modules to its precache list.
- Added GitHub Actions CI (lint + build + Playwright on push/PR), ESLint flat config with zero current errors, `npm run lint` and `npm run serve` scripts, and updated README/AGENTS.md and the two source-text-pinning tests.
- Verified: function inventory matches the original (130 functions, plus `createMap`), `npm run lint` clean, `npm run build` clean, and `npm test` passes all 40 tests against the built artifact.

## 2026-11-23T00:20:14Z

- Verified `.githooks/pre-commit` rejects edits to existing `observations.md` lines and accepts prepends.
- Committed the branding, i18n, recenter, auto-recompute, service-worker, and Playwright changes; pushing to `origin/main` follows in this turn.

## 2026-11-23T00:18:54Z

- Learned the deployed `public/` artifact and source tests had diverged: tests previously served the source tree, so broken branding/icons and stale i18n responses were not caught.
- Added root `AGENTS.md`, prepend-only `observations.md`, `.githooks/pre-commit`, the npm `prepare` hook, and README documentation.
- Restored the requested header copy (`擇角 Zak Geok [zé jiǎo]` and the exact English subtitle), removed the old Cantonese meaning line, and updated all 15 i18n catalogs plus no-JavaScript fallbacks.
- Moved recenter onto the Leaflet map beside zoom, made i18n network-first, bumped the service-worker cache to `zg852-v16`, and wired `scheduleRecompute()` into origin, person, and directory changes.
- Reworked Playwright to build and serve `public/`, then added smoke coverage for assets/icons, exact header copy, raw-key leakage, focus and fare visibility, stale catalogs, auto-recompute, and recenter placement.
- Verified `npm test`: 40 tests pass against the built artifact.
- Next: verify the observation hook, commit, and push.
