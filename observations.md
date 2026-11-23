## 2026-11-23T03:00:00Z

- Committed the audit fixes as `b12991c` and pushed `main` to `origin`.
- GitHub Actions deploy still has no Cloudflare secrets, so I deployed with the local wrangler login. Production `sw.js` is now `zg852-v24`.
- `https://zg852.pages.dev/definitely-not-a-page` returns 404. The deployment URL is `https://f8e0f31b.zg852.pages.dev`.

## 2026-11-23T02:57:00Z

- The live Playwright job finished with 50 failed and 0 passed. The live journey probe finished with exit 0. Both results are already in the 02:54 UTC section of `AUDIT-REPORT.md`.

## 2026-11-23T02:56:00Z

- Ran the live audit skill against `https://zg852.pages.dev/`. Appended the section to `AUDIT-REPORT.md`.
- The local graph script printed `ISSUE_COUNT 0`. The live graph is the old one. Airport to Tsing Yi is 24.47 minutes, and 40 short hops take 15 minutes or more. The live worker is `zg852-v21`.
- `TEST_BASE_URL=https://zg852.pages.dev npm test` failed 50 tests. Each one waited for `html[data-net=ready]`, and the live tag has no `data-net`.
- Browser checks: Nam Cheong and Tuen Mun with MTR only returned no areas twice. Two Central starts said there are no route legs, twice. `zzzzqqqq` hid the list. Urdu left the people panel at x=0.

## 2026-11-23T02:52:00Z

- The graph check matched the earlier measurements. Airport to Tsing Yi is 13.63 minutes, short slow hops are 0, and the Airport Express fare pair is HK$64.5. It edited nothing.

## 2026-11-23T02:50:00Z

- The source check of the non-graph fixes agreed with the test run. It edited nothing. Live remains `zg852-v21`.

## 2026-11-23T02:46:00Z

- Re-checked the audit fixes. `npm test` passed 50 tests. The shipped graph has Airport to Tsing Yi at 13.63 minutes, zero hops under 800 m that take 15 minutes, and both Yau Ma Tei to Jordan directions at 1.3 minutes.
- Live `https://zg852.pages.dev/sw.js` is still `zg852-v21`. The fixes are in the tree and are not on the public site.

## 2026-11-23T02:44:00Z

- The catalog pass left all 15 files with 148 keys. No non-English file still uses the English attribution sentence. No further edit.

## 2026-11-23T02:43:00Z

- The live route matrix on the old deployment agreed that MTR-only returns areas for the default pair and for Central to Sha Tin. That run did not change the tree.
- The MTR fare page download returned an empty file, so the Airport Express table already in `src/js/config.js` was left as it is. The fare test still checks that a Tsim Sha Tsui to Airport result is above HK$40.

## 2026-11-23T02:42:00Z

- Added a Playwright check that an MTR-only Tsim Sha Tsui to Airport search shows a fare above HK$40. The test passed. The full suite before that was 49 passed.

## 2026-11-23T02:40:00Z

- Implemented the audit fixes in the tree. No deploy and no commit.
- The graph builder retimes long 45 km/h rail hops at 80 km/h, caps hops under 800 m that take 15 minutes or more, and labels ferry and light rail separately. Airport to Tsing Yi is 13.63 minutes. The 51 minute bus hop is gone.
- MTR-only Nam Cheong and Tuen Mun now returns an area because a station may have an 8 minute gap. Identical Central starts say "Already there". An empty Photon result shows a no-match line.
- The service worker is `zg852-v24`. It keeps the shell and uses the network first for data. A missing WebGL map no longer stops the rest of startup. `--subtle` contrast is 7.06:1. Controls are 44px. Urdu puts the people panel on the right.
- `npm test` passed 49 tests.

## 2026-11-23T02:36:00Z

- Added the repo skill `.cursor/skills/audit-live-zg852/`. It audits https://zg852.pages.dev/ the same way as the live QA pass: evidence twice, live origin only, and a graph script for Airport Express speed, short bus hops, and station positions.
- `python .cursor/skills/audit-live-zg852/scripts/graph_sanity.py` exits 0. On the current tree it printed `ISSUE_COUNT 0` and line codes 0, 1, 2, and 3.

## 2026-11-23T02:42:00Z

- Translated the catalog strings for attribution, empty routes, budget ends, credits, zoom, map reports, empty search, ferry, light rail, and map start failure.
- All 15 catalogs have 148 keys. The key set matches `en.json`. No non-English file keeps the English attribution sentence.
- French and Spanish budget ends stay `15 min` and `180 min` because those catalogs already use `min`.

## 2026-11-23T02:28:00Z

- The MTR cell trace finished. Fair areas are stations, exits, and bus stops. MTR lines stop on platforms, which are not candidates. For Nam Cheong and Tuen Mun at 90 minutes and 10% tolerance, rail reaches 85 stations and the closest pair still fails the band, so MTR-only is empty. Both modes still finds bus-stop cells.
- Added that keep-test change to the fix plan. Kind 1 stations may have a gap of up to 8 minutes. Exits and bus stops stay on the old rule.

## 2026-11-23T02:26:00Z

- The live MTR matrix command finished with exit 0. It wrote 14 result rows. Those rows are already in the data-correctness section of `AUDIT-REPORT.md`.

## 2026-11-23T02:25:00Z

- Checked whether live trip results are true, and appended that pass to `AUDIT-REPORT.md`.
- MTR-only is not empty. Twice each, Tsuen Wan plus North Point, Central plus Sha Tin, and Central plus Kowloon Tong returned five areas whose steps are MTR.
- Station coordinates for 22 known stations are within 400 m. Island, Tsuen Wan, Kwun Tong, and East Rail station order matches the real lines.
- The Airport Express error is in the GTFS feed. Trip `MTR-AEL-DT` clocks AsiaWorld-Expo at 00:00:00 and Hong Kong at 00:40:27. The shipped Airport to Tsing Yi edge is 24.47 min. 156 of 256 rail edges match 45 km/h.
- Forty bus edges are under 800 m and at least 15 min. The worst is route 88R, 51.1 min for 270 m. Ferry route 7006 is stored as a bus.
- The existing MTR-only end-to-end test only checks that heat cells appear. It does not check a time or a line.

## 2026-11-23T02:18:00Z

- Audited the live site `https://zg852.pages.dev/` only. Wrote the report to `AUDIT-REPORT.md`. No source fix, commit, or deploy.
- Production at 02:13 UTC was still service worker `zg852-v21` with the header status line. The later `zg852-v23` notes in this file were not on the origin yet.
- `TEST_BASE_URL=https://zg852.pages.dev npm test`: 41 passed, 2 failed. Both failures fetch `/_headers`, which returns the home page with status 200.
- Highest live defects: unknown URLs return the home page at 200; no WebGL2 aborts startup on "loading" with zero person cards; an offline reload fails because `/` is not handled by the worker; Airport Express Airport to Tsing Yi is shown as 30.5 min and HK$13.2.
- Also confirmed: empty Photon success is silent; English attribution, credit line, "15 min"/"180 min", and "Zoom in" remain in all 15 locales; Urdu sidebars stay in the left-to-right places; `--subtle` contrast is 3.54:1; several targets are under 44px; `PRIVACY.md` denies the font glyph request that cold loads make to `tiles.openfreemap.org`.
- Cold Fast 3G plus 4× CPU, cache off, twice: map ready at 11.1 s and 11.2 s, about 1.29 MB on the wire. `network.json` is 589 KB and takes 6.6 s. Lighthouse 12.8.2 scores: performance 86, accessibility 96, best practices 96, SEO 100. That Lighthouse run hit the WebGL2 failure and did not load the graph.

## 2026-11-23T02:10:00Z

- Removed the header line "Browser-side routing. Timetable: network ready Saved on this device."
- Deleted `header.status` and `header.saved` from all 15 catalogues, and the `.status` CSS rules.
- Network readiness is now `document.documentElement.dataset.net`. Tests wait on that attribute. Service-worker cache is `zg852-v23`.
- `npm test` passed 43 tests.

## 2026-11-23T02:08:00Z

- Committed the sidebar flip and the 13px Jyutping as `0c93edf` and pushed it to `main`.

## 2026-11-23T02:05:00Z

- Made the Jyutping `zau6 goek3` 13px. It stays italic and uses the lighter `--subtle` color. The name 就腳 stays at 20px.
- The left sidebar now has two faces. People are the default. Results stay hidden until the user swaps or presses Search.
- The swap control is `#swapFace`, an icon button at the top right of the left sidebar. `setSidebarFace()` in `src/js/ui.js` flips the stage on the Y axis, then shows the other face. Reduced motion skips the animation.
- Search (`#go` and `#emptyRun`) opens the results face. Later recomputes do not pull the user back.
- Added `sidebar.swap` to all 15 catalogues. Bumped the service-worker cache to `zg852-v22`.
- `npx eslint .` is clean. `npm test` passed 43 tests. The locale test needed a swap back to people before it could click Add. Changes are not committed.

## 2026-11-23T01:46:00Z

- Removed the English name "Zak Geok" from the header, page titles, meta tags, catalogues, legal pages, README, and `llms.txt`. The visible heading is now 就腳 plus the Jyutping `zau6 goek3`.
- The Jyutping sits in `h1 .jyutping`. It is italic, weight 400, and uses the lighter `--subtle` color. `app.title` stays plain text because the document title cannot carry style.
- Person-card icon buttons now use `--field` (39px), the same height and width as the text inputs. The pin column uses the same size.
- Bumped the service-worker cache to `zg852-v21`.
- `npx eslint .` is clean. `npm test` passed 43 tests, including the new heading style check and the input-to-icon size check.

## 2026-11-23T01:50:00Z

- Committed and pushed the dead-code removal as `52ed9c2` on `main`. 20 files, 19 insertions, 202 deletions.
- CI run `45095516256`: `test` job passed. `deploy` job failed. Root cause: the repo has no `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` secrets, so wrangler cannot authenticate in Actions. This is the same failure as run `45094151842` at 01:21.
- Deployed by hand instead: `npm run pages:deploy` with the locally authenticated wrangler. Upload succeeded, deployment `37d8bbff`.
- Verified production at `zg852.pages.dev`: `sw.js` serves `zg852-v20`, `en.json` no longer holds any removed key, the bundle no longer holds `personColor`, and `/`, `/app.js`, `/i18n/en.json` all return 200.

## 2026-11-23T01:42:00Z

- Executed the dead-code removal. Deleted `personColor` and 15 unused `ICONS` entries in `src/js/util.js`, `oldWeight` and `oldRecent` from `KEY` in `src/js/config.js`, and the `.icon-reset`, `.options-divider`, `.linkish` rules in `src/styles.css`.
- Stripped the 13 unused i18n keys from all 15 catalogues in `static/i18n/`. 195 lines removed, none reformatted.
- Bumped the service-worker cache to `zg852-v20`. `finalize.mjs` patch strings still match.
- One edit error: a first `sed` pass on `styles.css` used off-by-one line numbers and deleted two innocent lines. Restored from git and redid the deletions with `StrReplace`. Final diff verified as exactly three removed lines.
- Verification: `npx eslint .` clean, `npm test` green with 43 passed. Over-exported symbols were left as-is, per the audit report.

## 2026-11-23T01:40:00Z

- Ran a read-only dead-code audit on request. No code changed.
- Method: read every module in `src/` and built the call graph by hand. ESLint `no-unused-vars` passes clean, so no unused imports exist. Verified each export, store field, DOM id, CSS class, and i18n key by grep across `src/`, `tests/`, `scripts/`, `static/`.
- Confirmed dead: `personColor` in `src/js/util.js`; `KEY.oldWeight` and `KEY.oldRecent` in `src/js/config.js`; the `reset` entry in `ICONS`; the `.icon-reset`, `.options-divider`, `.linkish` rules in `src/styles.css`.
- Confirmed dead i18n keys in all 15 catalogues: people.centre, people.drag, people.hintPinMode, people.librarySaved, people.libraryUpdated, results.shown, results.score, results.selectPrompt, map.routes, map.pinHint, route.leg, results.fit, share.copy.
- Also flagged 30 exported symbols with only same-module callers (over-exported, not dead). User wants to verify before any deletion.

## 2026-11-23T01:35:00Z

- Committed the security fixes as `5d6f151` on `main`. Seven files, 43 insertions, 15 deletions. Working tree clean.
- First commit attempt was rejected by the pre-commit hook. It found that an earlier prepend had deleted the `## 2026-11-23T01:32:00Z` header line in this file. Restored the header and recommitted.
- The hook works as intended. It checks the staged diff for any removed line in `observations.md`.

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
