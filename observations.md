## 2026-11-23T13:43:50Z

- Committed the full change set as `f7d97d0` ("feat: add wait-aware times, full MTR names, and trip fairness metric", 42 files) and pushed to `origin/main`; the i18n pre-commit hook ran and passed. Working tree is clean.

## 2026-11-23T13:43:18Z

- Completed integration of the timing/i18n/fairness change set: all five subagent outputs merged, double-counted boarding wait removed from describe(), rideLegText() now honours full line names, dead normFocus alias removed, and map hover routes follow the global fairness metric.
- Fixed two brittle test assertions that contradicted the new behaviour: rail chips must show full line names (not "MTR"), and a contiguous rail group books its fare on the last rail leg, so fare assertions check any leg rather than the first.
- Verification clean: `npm run lint` (including i18n key parity across 15 catalogs), `npm test` 60/60 passed against built public/, and `git diff --check`. Ready to commit and push.

## 2026-11-23T13:38:43Z

- Tests/docs subagent completed: focus tests became trip-fairness tests, catalog expectations gained the new keys, docs/process/privacy describe the new timing and fairness model.
- Routing/state subagent completed the global fairness setting, fare-grid solve, wait-aware leg construction, full-line-name propagation, and fare grid engine flow. Its self-audit found that solve() already includes boarding wait in the first ride-state stepT, so a follow-up was dispatched to remove a duplicate addition in describe().
- i18n subagent completed with corrected fare strings that no longer hardcode HK$, 150 keys in all 15 catalogs, intNum()/whole-minute formatting, and an i18n pre-commit hook; `npm run i18n:check` passes.
- Integration fixes applied: added `.fairness-label` to the options markup for the production smoke selector, and made map hover routes pass `store.settings.fairnessMetric` into prepareRoutes().

## 2026-11-23T13:37:48Z

- UI subagent completed: added the global fairness control in the sticky options panel, removed per-person focus UI/state copies, made results/detail metric-aware with whole-minute values, and switched MTR chips to full line names. Its diff preserves the existing swap/reveal and layout behavior.
- Caught an integration defect before verification: results.fareSpread/results.fareLongest strings included a literal HK$ while the UI passes money() values that already contain HK$. Dispatched a correction to the i18n subagent to keep only the `{value}` placeholder.

## 2026-11-23T13:36:03Z

- Reviewed the completed GTFS subagent diff: duration-weighted average headway now produces per-line boarding waits, route_long_name supplies full MTR display names in a new `n` field while `l` codes remain unchanged, datasets were regenerated, and the service-worker cache is `zg852-v32`.

## 2026-11-23T13:34:17Z

- Began the next change set with five parallel subagents: GTFS duration-weighted headway waits plus full MTR line names and SW cache `v32`; global time/fare fairness metric and fare grids in routing/state; i18n key repair with `intNum()` and an i18n pre-commit hook; UI fairness control, integer minute display, and full line-name chips; and matching test/docs updates.
- Explicitly preserved the previous requirements: no start hints, i18n raw-key fallback, per-person walk tolerance, sticky rightbar options/results, leftbar route-detail flip, and explicit selection revealing detail.

## 2026-11-23T13:25:13Z

- Integrated the second change set: removed all start-place hints, added `t()` fallback plus SW cache `zg852-v31`, added per-person `walkMinutes` (default 20, whole-trip walk preference), moved sticky options/results to the rightbar and route detail to the leftbar flip face, and wired map/result selection to reveal that face.
- Fixed integration gaps: result-row clicks now call `selectResult(..., true)` so selecting a result flips the leftbar, and updated Playwright selectors/expectations for the new two-face layout and always-visible rightbar results state.
- Verified `npm run lint`, the full `npm test` suite against built `public/` (60 passed), and `git diff --check`; all 15 i18n catalogs keep identical key sets. Ready to commit and push.

## 2026-11-23T13:01:33Z

- User asked to commit and push. Working tree contains the integrated UI/routing/data changes plus pre-existing uncommitted edits to `AUDIT-REPORT.md` and `observations.md`.
- Plan: keep the audit-report refresh in its own commit, then commit the feature work (including this log) and push both to `origin/main`. Verification before commit: lint clean, 59 Playwright tests passed.

## 2026-11-23T12:19:38Z

- All four subagents finished and their work was integrated. The GTFS pipeline now adds per-edge `g` geometry anchored to stop coordinates (55,583 aligned arrays; 62% of hops detailed) and `network.json` grew from 2.2 MB to 5.5 MB; `graph.json` and `nodes.json` stayed identical.
- Fixed two integration defects found by the full suite: rail chip labels became `MTR MTR TWL`, and the old no-fit tests relied on the removed 15-minute budget. Rail labels are now normalised to `MTR TWL`; no-fit tests use four spread-out starts while keeping the fixed 60-minute cap.
- Also switched leg fare chips to the localised `results.fareTotal` string so they read `Fare HK$…`, and refactored route-chip rendering into a `legChip()` helper.
- Verified `npm run lint` and the full `npm test` suite against built `public/`: 59 passed, 0 failed. `git diff --check` is clean; temporary probe spec and `__pycache__` are gone.
- `AUDIT-REPORT.md` retained its pre-existing uncommitted changes; I did not edit it.

## 2026-11-23T12:07:26Z

- The UI/state/build agent finished. Reviewed its diff: move controls and budget UI/state are gone, the fixed 60-minute cap is wired through the engine, the rightbar footer/Process page/share status are in place, and build/cache/docs are updated.
- Verified all 15 i18n catalogs parse with identical 148-key sets, including `legal.process`, `route.getOn`, and `route.getOff`, with removed budget/move keys absent.
- Cleaned stale budget references in `PRIVACY.md` and the local audit checklist. `src/js/routing.js` and `src/js/map.js` still show the pre-data-agent state, so the GTFS-shape agent is the only one still running.
- No full build/lint/test run yet.

## 2026-11-23T12:06:12Z

- The Playwright agent finished and both test files pass `node --check`; `git diff --check` is clean for the tests and stylesheet.
- Test updates now cover the removed move/budget controls, the new rightbar footer and Process legal page/dialog, visible share status, structured ride-leg cards, GTFS `g` geometry in `network.json`, rendered multi-vertex ride paths, and leg-fare reconciliation.
- The data/GTFS/routing/map and UI/state/i18n/build agents are still running; no full build, lint, or Playwright verification yet.

## 2026-11-23T12:05:03Z

- Started the requested changes with four parallel subagents using disjoint file ownership: data/GTFS shapes + routing + map, UI/state/i18n/build/docs, `src/styles.css`, and Playwright tests.
- The stylesheet agent finished: removed move/arrow and ride-text CSS, added the 6px header subtitle spacer, footer flex layout, share-status pill, and three-row route-card styles. Its diff was reviewed and looks consistent.
- The other three agents are still running. Current tree shows partial edits across app/state/i18n/tests and a new `src/process.html`; `scripts/__pycache__/` appeared from running the graph script and must be removed before finishing.
- No lint or Playwright run yet; integration and verification come after all agents finish. `AUDIT-REPORT.md` and the existing observations blocks remain untouched.

## 2026-11-23T11:32:30Z

- Familiarized with the repo; made no code changes. It is a static, client-side HK fair meeting-point finder built with Vite, Leaflet, MapLibre, and hand-written multi-modal routing, with 15 locale catalogs and 55 Playwright specs.
- Key structure: `src/js/store.js` holds shared state, `engine.js`/`routing.js` solve and rank fair cells, `ui.js`/`map.js` own behaviour, `static/data/` holds generated graph and POI files, `scripts/finalize.mjs` writes headers and patches the `zg852-v29` service worker.
- HEAD is `ec1f9c8`; only `AUDIT-REPORT.md` and this observations file are modified in the working tree. Route-affecting edits must call `scheduleRecompute()`, and cached-asset edits need an `sw.js` version bump plus matching finalize patch strings.

## 2026-11-23T03:53:00Z

- Fixed five audit defects and pushed `a20664a` then `fff4d71` to `origin/main`.
- A failed map layer stayed on the map and aborted search. A late Photon reply reopened the place list. Two-character Chinese names never searched. The phone form now sits above the map. Legal pages have social tags. The worker cache is `zg852-v27`.
- The bus-stop meeting title was left as it is. That name is the stop in the cell. `npm test` passed 55 tests. The live site does not have this build until the next deploy.

## 2026-11-23T03:33:00Z

- Audited live `https://zg852.pages.dev/` again and replaced the empty `AUDIT-REPORT.md` with this run.
- The graph script printed `ISSUE_COUNT 0`. Live `network.json` matches the tree. `npm test` against the live origin passed 50 tests.
- Six live issues are in the report. The largest are a WebGL2 failure that breaks search, a place list that reopens over the next field, and a silent result for `中環`.

## 2026-11-23T04:10:00Z

- Deploy run `45109888063` succeeded. `https://zg852.pages.dev/` no longer has the options-panel beta title or switch. The header badge remains. The service worker cache is `zg852-v29`.

## 2026-11-23T04:08:00Z

- Removed the options-panel beta title, switch, and experimental note. The header badge remains the switch. Interest sliders still appear when the badge is on. Pushed `ec1f9c8`.

## 2026-11-23T04:05:00Z

- The first push `eb0ee80` failed lint, so the site did not update. `ce7a16d` removed the control character that blocked lint. Deploy run `45109457751` succeeded. `https://zg852.pages.dev/` now serves the Beta badge, and the service worker cache is `zg852-v28`.

## 2026-11-23T04:02:00Z

- Pushed the header Beta badge as `eb0ee80` to `origin/main`. The badge was only in the local working tree before this push.

## 2026-11-23T04:00:00Z

- The header now starts with a Beta badge. It is 36px tall and sits before the saved-people button. A click turns interest preferences on or off, and the options switch follows that state. The tooltip says interest preferences can change the areas on the map. `npm test` passed 55 tests. The service worker cache is `zg852-v28`. This change is not committed.

## 2026-11-23T03:41:30Z

- Pushed `8e069d7` to `origin/main`.

## 2026-11-23T03:41:00Z

- The header now has three 36px buttons. Saved people, share, and language each use a 12px icon. The language name is not painted. Share is in the header.
- The left sidebar scroll width now equals its client width. The extra width came from a tooltip that laid out past the right edge. `npm test` passed 50 tests.

## 2026-11-23T03:27:00Z

- The local preview server on port 8765 stopped after the size check. That stop was intentional so the test suite could bind the same port. The compact chrome commit remains `442676f` on `origin/main`.

## 2026-11-23T03:26:00Z

- Pushed `442676f` to `origin/main`. The commit is `DESIGN.md`, `src/styles.css`, and `static/sw.js`. `observations.md` and `AUDIT-REPORT.md` stayed uncommitted.

## 2026-11-23T03:25:00Z

- Built `public/` and measured the compact scale. Desktop header is 52px, fields and icon buttons are 36px, card icons are 14px, chips are 32px, and body text is 14px. The header plus the layout equals the viewport on both 1280x800 and 390x844.
- A fixed `100vh - 96px` phone offset clipped the page. The layout now fills the space under the header.
- `npm test` passed 50 tests. Service worker cache is `zg852-v25`.

## 2026-11-23T03:20:00Z

- The page chrome is too large. `DESIGN.md` now records a compact scale. Controls are 36px, the base icon is 12px, and button icons are 14px. Body text stays 14px.
- One worker is editing `src/styles.css` to that scale. Browser check, commit, and push come after that edit.

## 2026-11-23T03:11:00Z

- Replaced the GitHub secret `CLOUDFLARE_API_TOKEN` with the API token from the Cloudflare create-token screen. `tokens/verify` returned active, and Wrangler listed the `zg852` Pages project with that token. The token value was not written into the repo.

## 2026-11-23T03:08:00Z

- A Wrangler refresh returns a new access token and a new refresh token. The old refresh token stops working. GitHub Actions cannot save that new refresh token with the default `GITHUB_TOKEN`.
- Restored the local Wrangler login after a refresh, and updated `CLOUDFLARE_API_TOKEN` to that new one-hour token. It expires about 2026-11-23T04:07:56Z.

## 2026-11-23T03:05:00Z

- Set GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` on `viscory/zg852`. The token is the current Wrangler login. It expires at 2026-11-23T03:59:49Z. This login cannot create a long-lived API token. The API returned 403.
- Reran the failed deploy job on run `45103410459`. The test job had already passed.

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
