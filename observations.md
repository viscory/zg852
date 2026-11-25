## 2026-11-25T16:09:28Z

- Closed the 10 evidenced contradictions through a shared `src/js/model.js` semantics layer: fairness/fare ranking, heat value, walk-step snapping, gap floors, closest-stop source matching and error-key selection. Rewired engine, routing, map, UI, state and diagnostics to that single definition.
- Added only the two permitted copy keys to the fallback and all 15 catalogues (189 keys each), bumped the service worker to `zg852-v69`, and added 11 regression tests; stale expectations in four existing suites were updated to the disclosed behaviour.
- `npm run lint` is clean and `npm test` passes 160/160 against built `public/`. Committed and pushed the tracked fixes; left `audit/`, screenshots and other artefacts untracked.

## 2026-11-25T15:44:26Z

- Committed and pushed `3c6db2a` ("fix: correct meeting-point fairness, fares and source selection") to `main` at `github.com:viscory/zg852.git`. The commit includes both this round's calc-logic fixes and the earlier uncommitted honest-copy fixes; 37 files, 767 insertions, 105 deletions.
- Left the pre-existing untracked screenshot/audit artefacts (`audit/`, `*.png`) out of the commit. Working tree is clean apart from those artefacts and this observations block.

## 2026-11-25T15:39:11Z

- Final pass: corrected the Light Rail stop count to include boarding and alighting stops (`sum(stopCount) + legs + 1`) and added a regression assertion. Re-ran lint (clean) and the full suite: 149/149 pass against built `public/`. No commit made; the unrelated dirty work is preserved.

## 2026-11-25T15:35:53Z

- Fixed the five remaining calc-logic findings without reverting the unrelated dirty work: (2) pin and cell walk tolerance now use the same raw comparison; (4) coordinate origins pool distinct nearby stations/platforms instead of collapsing to one exit; (6) long bus/minibus/ferry legs use official Transport Department full fares from a new bundled snapshot, with distance bands only as flagged fallbacks; (7) fare ranking sorts by total paid then relative spread and filters on mean fare; (10) stale hardcoded AEL fares are gone, AEL uses the bundled matrix, light rail has its own chart, and unknown fares carry an ≈ marker.
- Added `scripts/generate-route-fares.py` (2,745 line fares from TD open data), `static/data/route-fares.json`, a `results.fareEstimated` key in all 15 catalogues, fare-estimate and diagnostics fields, and `tests/calc-logic-fixes.spec.js` with seven regressions.
- Deployment allowlist and service-worker precache now include `route-fares.json`; service worker bumped to `zg852-v68` and the catalogue-count pin updated to 187.
- `npm run lint` is clean and `CI=true npm test` passes 149/149 against built `public/`. No commit has been made yet.

## 2026-11-25T15:02:02Z

- Implemented the five approved findings without consulting `AUDIT-REPORT.md`: fairness copy now follows the shared Time/Fare metric definition; the fare heat scale is derived from bundled fares (top HK$120) instead of the old HK$25 cap; ride chips link only to real HK Bus route pages; source lookup returns typed availability reasons so mode exclusions get mode-specific copy; and pinned-point rejection distinguishes walk-limit failures from the 90-minute budget.
- Added `tests/fixed-findings.spec.js` with five regressions, updated affected exact-copy assertions and all 15 catalogues (186 keys), and bumped the service worker to `zg852-v67`.
- `npm run lint` is clean and `CI=true npm test` passes 142/142 against the built `public/` output. No commit has been made yet.

## 2026-11-25T14:12:20Z

- Pushed `63de099`; CI run `45630686352` passed the 137-test job and the Cloudflare deploy. Live is SW `zg852-v66`.
- Live checks: subtitle, tolerance label/help, Beta diagnostics note and "Top N areas" copy all render; the selected-area title matches a stop used by its routes. Smoke plus truth specs passed 9/9 against the deployed site.
- No further source changes are pending.

## 2026-11-25T14:06:11Z

- Implemented audit fixes 1–6 with the recommended defaults. Copy changes across all 15 catalogues: `app.subtitle` → "Find a fair meeting point in Hong Kong", `results.areas` → "Top {count} areas", tolerance labels → "Target … difference" plus a new `options.toleranceHelp` note disclosing the 8-minute/5-minute/HK$1 floors, a new `beta.diagnosticsHelp` note and a shorter Beta tooltip. Deleted the dormant preference keys and the unused `preferenceText()`; catalogue key count is now 184.
- `buildCells()` now updates label, priority and keyCat together with the chosen node, so a result's title names the same stop used by its marker and routes. Ordering and times are unchanged.
- Privacy page and `PRIVACY.md` now describe the Beta Diagnostics download and clipboard copy. Added `tests/truth.spec.js` with three regressions and updated exact-copy assertions in e2e, mobile, fairness and production-smoke specs.
- Service worker cache bumped to `zg852-v66` and the pin in `tests/audit-sw.spec.js` updated. `npm run lint` clean; `CI=true npm test` passes 137/137. Commit, push and live verification are next.

## 2026-11-25T13:51:21Z

- Pushed `0efcb0d`; CI run `45627098663` passed the 134-test job and the Cloudflare deploy. Live is SW `zg852-v65`.
- Live verification of the reported scenario: Kowloon Bay → Lok Ma Chau shows HK$46.6 and Chai Wan → Lok Ma Chau shows HK$54.4, with no HK$20.5 band cap. The fare dataset is precached and served from `data/mtr-fares.json`.
- No further source changes are pending.

## 2026-11-25T13:46:27Z

- Replaced the distance-band MTR fare calculation with official station-pair lookups. `scripts/generate-mtr-fares.mjs` snapshots MTR open data (Adult Octopus matrix plus Airport Express fares) into `static/data/mtr-fares.json`: 8,836 metro pairs, 14 AEL pairs and 928 node→station mappings.
- The app loads the snapshot at startup; `fares.js` resolves platform/exit/station nodes back to a station and looks up one fare for each continuous paid-area rail run. Unmapped pairs fall back to the old band fare with a console warning; bus fares remain band estimates.
- The user's example now shows the official fares: Kowloon Bay → Lok Ma Chau HK$46.6 and Chai Wan → Lok Ma Chau HK$54.4, instead of both capping at HK$20.5.
- Added the dataset to the deployment allowlist and service-worker precache, updated Credits/Process/README/DESIGN, and bumped SW to `zg852-v65`.
- Added `tests/fares.spec.js` for dataset integrity and the route-level fares. `npm run lint` is clean; `CI=true npm test` passes 134/134. Commit, push, CI deploy and live verification are next.

## 2026-11-25T13:01:40Z

- Pushed `26d91f2`; CI run `45618814769` passed the 132-test job and the Cloudflare deploy. Live is SW `zg852-v64`.
- Live checks: results count has 8 px inline-end padding, the results section has both the static bottom drop shadow and the dynamic inset shadow, and clicking bus while it is the only active mode leaves it on. The unbounded map-view regression passes in the browser.
- No further source changes are pending.

## 2026-11-25T12:57:29Z

- Added 8 px inline-end padding to the results count so “7 areas” no longer sits against the edge.
- Transport mode chips now refuse to switch off the last active mode; at least one of MTR / bus is always on, so the no-mode error cannot be triggered by clicking.
- The results section now has a static bottom drop shadow above the footer, in addition to the existing dynamic inset shadow while more rows remain below.
- In Unlimited mode, tapping the map no longer fits or recentres the view. `renderSelection` skips `fitMapTo` whenever `store.unbounded` is true, including explicit point selections.
- Added regressions for all four and bumped the service worker to `zg852-v64`.
- `npm run lint` is clean; `CI=true npm test` passes 132/132. Commit, push, CI deploy and live verification are next.

## 2026-11-25T11:38:38Z

- Pushed `1e5e11d`; CI run `45595058732` passed the 131-test job and the Cloudflare deploy. Live is SW `zg852-v63`.
- Live checks: one icon-only search button in the right bar — 36 px at the top of Parameters on desktop, 44 px fixed at the bottom on mobile Plan — with no visible text. The accessible label and tooltip still say “Find fair areas”.
- No further source changes are pending.

## 2026-11-25T10:26:38Z

- Removed the visible **Find fair areas** text from the single search button. It is now the same icon-only control as the original desktop `#go`, with the label kept as sr-only text for the accessible name, tooltip and tests.
- `.go-top` is a flex row now, so the magnifier and label can never stack into two lines. Both desktop and mobile use the icon-only button.
- SW cache is `zg852-v63`. `npm run lint` is clean; `CI=true npm test` passes 131/131. Commit, push, CI deploy and live verification are next.

## 2026-11-25T10:18:38Z

- Pushed `2b0fb61`; CI run `45593077057` passed the 131-test job and the Cloudflare deploy. Live is SW `zg852-v62`.
- Live checks: exactly one visible **Find fair areas** button in the right bar, at the top of Parameters on desktop and fixed at the bottom on mobile Plan; none on mobile Results. “Max time difference” is a single 15 px line. The slider min is 1 and maps to 5%; 0% is no longer selectable. Mobile Results hides `#resultState` correctly again.
- No further source changes are pending.

## 2026-11-25T10:14:24Z

- Collapsed the search action back to one button. `#go` now sits at the top of the Parameters panel with a visible **Find fair areas** label; the duplicate `#goTop` and the empty-state `#emptyRun` are gone. On mobile Plan the same `#go` is the fixed bottom button; on mobile Results the Parameters panel stays hidden.
- Removed the 0% stop. The slider now starts at 5% (`min=1`): 5% → 100% linear in 1% steps, 100% → 300% logarithmic, then Unlimited. Stored values below 5% snap to 5%, so a 0% difference can no longer be selected from an old link or saved setting.
- Shortened the tolerance labels to one line in all 15 catalogues: **Max time difference** and **Max fare difference**. The right-hand end label remains **Unlimited**.
- Fixed a dangling mobile Results CSS selector left by removing `#emptyRun`, which had stopped `#resultState` from being hidden.
- Updated the slider helper, min/max assertions, label tests and the search/empty-state tests. SW cache is `zg852-v62`.
- `npm run lint` is clean; `CI=true npm test` passes 131/131. Commit, push, CI deploy and live verification are next.

## 2026-11-25T09:50:16Z

- Pushed `38d4390`; CI run `45588629039` passed the 131-test job and the Cloudflare deploy. Live is SW `zg852-v61`.
- Live checks: the top **Find fair areas** button is visible on desktop and runs the search; the results section gets `scroll-bottom` and clears at the end. The slider reports 0% at 0, 10% at 6, 100% at 96, 101% at 97, 300% at 200 and Unlimited at 201, with end labels Near equal / Unlimited. The mobile Results pane also gets the bottom shadow class.
- No further source changes are pending.

## 2026-11-25T09:46:31Z

- Added a dynamic bottom scroll shadow. It appears on the desktop results list, the mobile Results pane and the mobile Plan pane only while more content exists below, and clears at the end. Mobile gets a fixed fade above the tabbar / fixed search button so the shadow is not hidden under them.
- Added a second labelled **Find fair areas** action at the top of the Parameters panel and wired it to the same search, pending-origin guard and `Working` state as `#go`. It is desktop-only; mobile Plan already has the fixed bottom search button, and mobile Results hides the Parameters panel entirely.
- Reworked the tolerance slider: 0%, then linear 1% steps from 5% to 100%, logarithmic from 100% to 300%, then Unlimited. The range max is now 201; stored tolerances below 5% snap to 5%. The right-hand label now says **Unlimited** instead of “More flexible”.
- Updated the test slider helper, tolerance/max assertions, README/DESIGN and added regressions for the top button, bottom scroll shadow and the new slider stops. SW cache is `zg852-v61`.
- `npm run lint` is clean; `CI=true npm test` passes 131/131. Commit, push, CI deploy and live verification are next.

## 2026-11-25T09:03:36Z

- Pushed `742f1e0`; CI run `45581221743` passed the 130-test job and the Cloudflare deploy. Live is SW `zg852-v60`.
- Live check: the right sidebar footer now reads only Privacy / Terms / Credits / Process, with no routing or FairPin copy. The Credits dialog still contains the FairPin inspiration and the Process dialog still contains the browser-routing/Photon/OpenFreeMap note.
- No further source changes are pending.

## 2026-11-25T08:59:46Z

- Removed the two footer paragraphs from the right sidebar: the browser-routing/Photon/OpenFreeMap note and the FairPin inspiration line. The footer now contains only Privacy / Terms / Credits / Process (and diagnostics in beta).
- The information is already folded into the legal pages: the routing/device note is on Process, the OpenFreeMap/Photon sources and FairPin inspiration are on Credits, and Terms repeats the inspiration and third-party-service notes.
- Updated the footer regression to assert the old copy is gone and kept the legal-dialog test asserting the inspiration text on Credits and the routing note on Process. SW cache bumped to `zg852-v60`.
- `npm run lint` is clean; `CI=true npm test` passes 130/130. Commit, push, CI deploy and live verification are next.

## 2026-11-25T08:46:52Z

- Pushed `eb29b63`; CI run `45578686810` passed the 130-test job and the Cloudflare deploy. Live is SW `zg852-v59`.
- Live checks: heat cells use the warm `#9F1239 → #E11D48 → #F97316 → #FACC15` steps; Yuen Long pins with the Tuen Ma Line route (52 min Alex, 58 min Sam); a far point shows the centred map notice at 12/64 px, 369×60 px on a 393 px phone, and the Unlimited hint is hidden behind it.
- No further source changes are pending.

## 2026-11-25T08:42:35Z

- Refined the new map notice: it now suppresses the Unlimited hint while visible, and the hint stays hidden whenever a point is pinned too. The notice auto-hides after 7 seconds and the hint returns when appropriate.
- Bumped the service worker to `zg852-v59` because the notice/hint logic changed after the v58 deploy.
- `npm run lint` is clean; the full suite passed 130/130 before the v59 cache bump, and the targeted notice/SW tests pass after it. Commit and deploy are next.

## 2026-11-25T08:36:12Z

- Reverted the blue heat palette to the documented warm dark-maroon → red → orange → yellow sequence (config, legend swatches and the heat-colour test). The blue scale was my call and it made the map read as water/cold rather than a heatmap.
- Raised the fixed travel budget from 60 to 90 minutes. This makes Yuen Long reachable from North Point + Chai Wan with average headway on, and the pinned point now shows the Tuen Ma Line to Yuen Long instead of refusing the point.
- Point-pick failures no longer use the sidebar error. A map notice now appears in the same top-centre slot as the pinned-point banner, with an alert icon, the 90-minute explanation and a close button. Successful point/area selections clear it.
- Fixed the shared mobile banner animation: `mobile-detail-in` ended on `transform:none`, which stripped `translateX(-50%)` and pushed the pinned-point and notice banners half off-screen. A dedicated `map-banner-in` keyframe preserves centring.
- Updated all catalogue copy from 60 to 90 minutes, README/DESIGN, the diagnostics budget assertion, the Yuen Long regression and the out-of-reach notice regression. SW cache is now `zg852-v58`.
- `npm run lint` is clean; `CI=true npm test` passes 130/130. Commit, push, CI deploy and live verification are next.

## 2026-11-25T07:54:41Z

- Pushed `1d76b45`; CI run `45571308419` passed the 129-test job and the Cloudflare deploy. Live is SW `zg852-v57`.
- Live exact-scenario check: Metropole Building + Chai Wan, rail-only, Time Unlimited still ranks Tai Koo first (13 min longest), with no error.
- Live Yuen Long check: with average headway on it now refuses the point with “That point cannot be reached by everyone within 60 minutes.” With headway off it pins Yuen Long and shows the Tuen Ma Line to Yuen Long (47 min Alex, 58 min Sam) instead of the old 58-minute walk from Kam Sheung Road.
- No further source changes are pending.

## 2026-11-25T07:50:20Z

- Reproduced the pasted scenario exactly: Metropole Building (walk to North Point) + Chai Wan, rail-only, Time Unlimited. Tai Koo at 12.2/12.6 min is the correct fair area, not a routing bug. Yuen Long is outside the 60-minute cap for Chai Wan when average headway is included.
- Found the real defect behind “why is this not telling me to take the MTR to Yuen Long”: a map pick near Yuen Long snapped to Kam Sheung Road because it was the last stop inside the 60-minute grid, then appended a 58-minute walk to the pin while the panel still reported the station total as 50/60 min. The point pick neither capped the final walk nor counted it in the total.
- `selectPoint` now only accepts a stop when everyone can reach it, the final walk fits each person’s walk tolerance, and station time plus final walk fits the 60-minute budget. If nothing qualifies it shows the new localized `error.pointOutOfReach` message instead of inventing a long walk. Pinned-point totals now include the final walk, so the displayed total matches the legs.
- The Unlimited hint now says the 60-minute travel limit still applies. Diagnostics export the active fairness metric, both tolerances and `travelBudgetMinutes`.
- Added a share-link regression for North Point + Chai Wan → Yuen Long, updated the catalogue key count to 185, and bumped the service worker to `zg852-v57`.
- `npm run lint` is clean; `CI=true npm test` passes 129/129. Commit, push, CI deploy and live verification are next.

## 2026-11-25T07:31:00Z

- Pushed commit `fed4638`; CI run `45568294664` passed the 128-test job and the Cloudflare deploy. Live is SW `zg852-v56`.
- Live verification: the map key’s width/height samples shrink smoothly (305→293→179→113→112 px, height 124→106→66→42 px, body 82→64→24→0) with no tall reflow; fare Unlimited shows no heat cells and a pin tap produces the pinned-point banner.
- No further source changes are pending.

## 2026-11-25T07:27:00Z

- Moved the Find fair areas button inside the Parameters panel so it sits with the controls on desktop and mobile.
- Fixed the map-key close animation: the legend now has explicit open/closed widths and a fixed-width body, so width and height shrink together instead of narrowing the content and producing a tall reflow. Desktop key is 364→112 px; mobile 305→112 px, with a 0.22 s width and grid-row transition.
- Replaced the warm heat palette with a blue sequential scale (`#082F49` → `#BAE6FD`) and an absolute fare scale capped at HK$25. Fare heat now shows actual expense (highest fare), not relative fairness; time heat stays absolute against the 60-minute budget. Both use dark = cheaper/faster.
- Unlimited now follows the active metric. Fare mode with Unlimited hides heat cells, shows the tap-anywhere hint, and allows map point selection. The selected-point marker bubbles clicks instead of opening a popup, so it no longer blocks the map.
- `npm run lint` is clean; `CI=true npm test` passes 128/128 twice. SW cache is `zg852-v56`. Commit, push, CI and live verification are next.

## 2026-11-25T06:59:00Z

- Pushed commit `57b956e`; CI run `45564173986` passed the 127-test job and the Cloudflare deploy. Live is SW `zg852-v55`. Desktop map key toggles cleanly (`open` true → false, body height 0), and the fare legend says “cheaper fares”.
- No further source changes are pending after the deploy.

## 2026-11-25T06:55:00Z

- Replaced the native `<details>` map key and interest ratings with shared disclosure panels: a proper button, `aria-expanded`, +/− mark, and an animated `grid-template-rows`/opacity transition. The desktop map key now starts open and is collapsible; the mobile key starts closed. The key body is pointer-transparent so it no longer blocks map hovers, while the header stays clickable.
- Fare-mode heat now colours by the **highest fare** (how expensive the meeting is), not by the fare-disparity score. The result order still uses `maxFare + fareGap`; the legend says “darker means cheaper fares”.
- Updated the disclosure tests, desktop collapse test, fare legend copy and docs. `npm run lint` is clean; `CI=true npm test` passes 127/127 twice. SW cache is `zg852-v55`. Commit, push, CI deploy and live verification are next.

## 2026-11-25T00:36:00Z

- Pushed commit `10ef7c5`; CI run `45518722916` passed the 126-test job and the Cloudflare deploy job. Live is now SW `zg852-v54`.
- Live fare mode at 393×664 opens with the Fare toggle active, a 25% tolerance, “fairer fares” legend text, 7 ranked results and 114 heat cells. The first result is East Tsim Sha Tsui (HK$10.6 / HK$10.4); ranking is by fare score.
- No further source changes are pending after the deploy.

## 2026-11-25T00:31:00Z

- Added a **Time / Fare** fairness toggle with clock/coins icons. Time keeps the existing filter and ranking; Fare keeps the 60-minute budget, drops the time-disparity filter, and ranks the top 300 time-feasible cells by `maxFare + fareGap`, with a HK$1 floor on the percentage. Each metric stores its own tolerance and share-link value.
- Replaced the linear tolerance slider with a logarithmic position model: 0%, 1–300%, then Unlimited. `#tolerance.value` is now a position; settings/share links keep the fraction. `travelTolerance()` no longer snaps to 5%.
- Reworked the heat palette to dark maroon → red → orange → yellow, raised fill opacity, and made dark mean *more fair* for both metrics. The legend text switches between travel time and fares.
- Updated the desktop Parameters panel, mobile Plan, all 15 catalogues (184 keys), tests, README and DESIGN. Added `tests/fairness.spec.js` and a shared slider-position helper; the suite now has 126 tests.
- `npm run lint` is clean; `CI=true npm test` passes 126/126 twice. SW cache is `zg852-v54`. Commit, push, CI deploy and live verification are next.

## 2026-11-24T14:43:00Z

- Made the red-area interest tooltip a fixed 240 px wide on desktop and 280 px on phones, with the title allowed to wrap. `positionTooltip` now clamps against the tooltip’s real width and height after it becomes visible, so long place names no longer resize or push the panel.
- The FEHD place list is still removed; the tooltip contains only the hovered place, `Area interest fit`, and the six bars.
- `CI=true npm test` passes 122/122; SW cache is `zg852-v53`. Commit, push, deploy and live verification are next.

## 2026-11-24T12:31:00Z

- Removed the dataset place list from the map interest tooltip entirely. The tooltip now shows only the hovered place name, the `Area interest fit` subtitle, and the six category bars; no `(fehd_rl)` suffixes or restaurant dumps remain.
- `CI=true npm test` still passes 122/122; SW cache bumped to `zg852-v52`. Commit, push, deploy and live verification are next.

## 2026-11-24T12:25:00Z

- Restored per-person route colours: walk/MTR/bus keep their dotted/solid/dashed styles, but each person now keeps their own accent colour (orange vs teal) instead of every line being red.
- Map tooltips now lead with the place under the cursor (`cell.label`, falling back to a nearby POI or district), with `Area interest fit` as the subtitle; POI names have their dataset suffixes stripped.
- Added a `mobileResultsEmpty` fallback on every Results entry so the “No fair areas yet / Plan a meet” state cannot disappear and leave a blank screen.
- Added mobile transitions: screen fade/slide on tab switches, route-card slide in/out, detail fade, toast/pin/key animations, with `prefers-reduced-motion` support. Icons were reduced (18 px tabs, 11 px header, 13 px card/chip) and Trip settings gained a 20 px separator above it. Vector avoid/off/prefer labels now align to the slider column instead of the whole row.
- Fixed the desktop Find button sizing: it was shrinking to 16 px after a search because it was a shrinkable flex item. `flex:none` keeps it at 36 px; the desktop beta panel now caps at `100dvh - 500px` so results remain visible.
- `CI=true npm test` passes 122/122 with two workers; `npm run lint` passes. SW cache bumped to `zg852-v51`. Commit, push, CI and live verification are next.

## 2026-11-24T11:51:00Z

- Pushed polish commit `d47846e`; CI run `45387232894` passed the test job and the Cloudflare deploy job. Live is now SW `zg852-v50`.
- Live mobile at 393×664 shows `就腳 zau6 goek3` plus “Find a fair place to meet”, a visible **Trip settings** shortcut, and a 189 px collapsed route card with a 44 px **Routes** button. Expanding it caps at 332 px and leaves the map zoom/recenter/attribution above the card.
- The Map key is a 40 px tap target above attribution, and Fair areas reads `7 areas` without the stray full stop.
- CI history reviewed: the red runs were real failures at specific commits, including the beta/Parameters overflow at `852ae1c`; that is fixed by the desktop max-height. The suite passed 122/122 twice locally with `CI=true` and two workers, and the latest run is green.
- No further source changes are pending after the deploy.

## 2026-11-24T11:46:00Z

- Polished the deployed mobile flow. The phone header now shows `就腳 zau6 goek3` plus “Find a fair place to meet” (`app.tagline`, all 15 locales); the full subtitle and tagline swap correctly on desktop, and the jyutping/tagline shrink at 320–360 px.
- The Map route card now opens collapsed at ~189 px with **Routes** and expands to 50dvh; route legs, interest ratings, and the fare note are hidden until expanded. Leaflet zoom, recenter, and attribution follow the real card height via `--route-card-h`, so they stay clear of both the collapsed and expanded card. The Map key is a 40 px tap target above attribution.
- Plan now has a visible **Trip settings** shortcut in the people header that scrolls to and focuses the settings heading. Results counts dropped the trailing period (`7 areas`). Pinned starts read `Pinned point · district`.
- Added a collapsed/expanded route-card regression, a header/settings-shortcut regression, and tightened the heat-tap test. `npm run lint` is clean; `CI=true npm test` passes 122/122 twice with the new two-worker CI setting.
- SW cache is now `zg852-v50`; i18n is 178 keys across 15 catalogues. Commit, push, CI, and live verification are next.

## 2026-11-24T10:35:00Z

- Pushed commit `8984716`; CI run `45375408078` passed the test job and the Cloudflare deploy job. Live `https://zg852.pages.dev/` now serves SW `zg852-v49`.
- Live mobile at 393×664 opens on **Plan** with no map chrome, a fixed Find fair areas button, three bottom tabs, and 3.5 full result cards after search. Tapping a result opens Map with a 292 px route card over a 552 px map; the key pill, zoom, recenter, and attribution all sit above the card.
- Live desktop at 1440×900 still shows the 360/740/340 grid, 52 px header, Beta badge, sticky Parameters, open static map key, icon-only search, and the footer. No mobile tab bar or mobile-only controls leak into desktop.
- Live screenshots are in `.playwright-mcp/live-v49-*.png`; no further source changes were made after the deploy.

## 2026-11-24T10:30:00Z

- Replaced the mobile sheet/pane model with three real destinations: **Plan**, **Fair areas**, and **Map**, driven by `data-mobile-view` and a fixed 56 px bottom tab bar. Removed the top mobile tabs, sheet handle, peek/half/full snaps, pane state, and mobile people/route flip.
- Plan now stacks People and Trip settings in one scroll with a fixed Find fair areas CTA, a mobile Beta row, and the legal links at the end. Fair areas gets the whole screen: count, scenario line, Edit, full-height cards, its own empty/loading state. Map gets the whole screen, a collapsed Map key pill, zoom/recenter above a contextual route card, and a full-screen pin-picking mode that returns to Plan.
- The route card reuses the existing detail panel, caps at 44dvh, and moves Leaflet controls/attribution above itself. Heat-cell tooltips are suppressed on mobile so they do not cover the card. Phone-map taps now fit at zoom 15 for larger cells.
- Desktop is scoped back to `DESIGN.md`: 360/340 rails, 52 px header, sticky Parameters with a desktop max-height for beta, static legend with no toggle, icon-only Find button, footer, and the people/detail flip. All new layout rules live inside `@media (max-width:1024px)`.
- Added `nav.plan`, `nav.map`, `nav.main`, `options.settings`, mobile results/empty copy, `map.close`, `map.pinHint`, and Beta on/off in all 15 catalogues plus `FALLBACK`; i18n check now covers 177 keys. Pinned starts read `Pinned point · {district}`.
- Rewrote the mobile, map, CSS, UI, state, and e2e specs for the new flow; `npm run lint` is clean and `CI=true npm test` passes 121/121. SW cache bumped to `zg852-v49`. Commit, push, CI deploy, and live verification are next.

## 2026-11-24T09:45:00Z

- Audited the live `https://zg852.pages.dev/` on an emulated iPhone 15 (393×852 DPR 3, touch, coarse pointer), plus the realistic 393×664 Safari visible area and 852×393 landscape. No source, test, or deploy changes were made; screenshots and JSON evidence are under untracked `audit/`.
- Critical: the parameters panel is a 120 px scroller (382–502 on 393×852, content 276 px) with `#go` sticky at 447–491. The tolerance slider sits at y=528, outside that window until you scroll; `#go` covers the bottom 14 px of the mode chips and the top 13 px of the headway row, so taps near those edges run Search instead of the control. The error banner (e.g. “Add at least two people…” at y=662–698) is below the panel’s clipped viewport at scrollTop 0 and is invisible; the search simply appears dead.
- Critical: after any search (which auto-selects a result), the first tap on the People tab turns the tab red and changes the header to “People and start places” but leaves the route detail face visible, with the start inputs at zero size. A second tap finally shows the form. Reproduced three times.
- High: at 393×664 the sheet starts at y=260, the nav covers 64–118 and the map key 68–150, leaving about 110 px of unobstructed map (23.5% of the screen is tappable map). In landscape 852×393 only 14.5% is map, and the results scroller is 60 px tall for 7 rows of 125 px. The map-key panel overlaps the nav by 50 px, and the pin banner overlaps the key by 24 px.
- High: with a 552 px visual viewport (like the iPhone keyboard), the autocomplete list runs 461–669, hiding the last two of four suggestions below the viewport; the page cannot scroll. Route detail at half sheet is a 289 px scroller for 648 px of content, so the fare note (y=937) is initially off-screen.
- Medium: “People and start places” truncates at 393 px (144 px content in 120 px), as does German; the primary action is a bare magnifier with no visible label or touch tooltip, and the empty state shows two stacked magnifier-only search buttons. Sheet handle reports `aria-expanded=true` at half; 125–386 map cells are individually tabbable; the locale select is 14 px; live lacks a manifest and apple-touch-icon. Inputs are 16 px, tap targets mostly ≥44 px, no horizontal overflow, and the core search/heat/pin flows work.
- During the audit another session was editing `src/` and using the shared Playwright MCP browser, so I re-verified every key metric in an isolated Playwright process against the live origin. The working tree now contains uncommitted mobile fixes (options toggle, mobile error toast, visible go text, collapsed map key, manifest/apple-touch-icon, roving map tab stop); I did not modify or deploy them.

## 2026-11-24T09:21:04Z

- Audited the live `https://zg852.pages.dev/` with the Playwright MCP at 1440×900, 393×852, 390×844, 360×800, 320×568, 414×896, 768×1024, and 844×390. No source, test, or deploy changes were made; screenshots are untracked local audit artifacts.
- Core flow works: cold DOM 274 ms, data ready 2.28 s, 2-person search 0.95 s, 7 results with fares/routes, auto-recompute on start/mode/tolerance changes, pin placement, saved people, share-link copy, offline reload + routing via SW `zg852-v47`, and graceful Photon-failure fallback to local stops. No app exceptions; only WebGL performance warnings.
- Mobile blocker: `.options-panel` is capped at 120 px with a sticky `#go`; `go` overlaps the headway row at every tested portrait width (320–768), and `#error` lands at y=662 inside that scroller, so failed-search and validation messages are invisible on mobile. The mobile tabs also truncate (“People and start …” at 393 px; “People and s…” at 320 px).
- Other verified issues: primary “Find fair areas” controls are icon-only (magnifier, hover tooltip only); the map has 600 tabbable `role=button` meeting-area paths; the legend shows brown-dotted walk / red-solid MTR / red-dashed bus but the route draws orange and teal; fair-area cells cover Victoria Harbour and look blocky; share links restore inputs but not the results/selected meeting point; Beta squeezes the desktop results section to 82 px; the /privacy, /terms, /credits, /process and 404 pages use a dark green-on-black theme unlike the light app; “1 people”; Cheung Chau gets “No areas fit this tolerance” despite both modes on; and “Fare HK$0”/unlabeled route totals need clearer wording.
- No missing i18n keys, but `map.fairArea`, `results.noFit*`, `error.noNearby`/`error.noReach`, and default person names remain English in all locales. The site has strong CSP/frame/permissions headers, no name-field XSS, ≥44 px mobile tap targets, and a visible 2 px focus outline on most controls; it lacks a web app manifest and apple-touch-icon.

## 2026-11-24T09:08:26Z

- Pushed commit `4f940c7`; CI run `45361731268` passed the 116-test job and the Cloudflare deploy job.
- Live verification at `https://zg852.pages.dev/` confirms SW `zg852-v47`, a `lucide-bookmark` mask on the saved-people button, and a visible pinned-point tooltip. All six tooltip fills now have real layout boxes (about 142, 139, 131, 114, 104, and 139 px wide at 5 px high), and the screenshot shows the red bars and bookmark icon correctly.
- Only untracked audit screenshots remain outside version control; no application regressions found.

## 2026-11-24T09:04:19Z

- Rechecked CI for `58a65f0`: run `45359353679` passed both the 115-test job and the Cloudflare deploy job, so the deterministic service-worker fix is live as `zg852-v46`.
- Reproduced the two new live reports with Playwright on `https://zg852.pages.dev/`. The pinned-point tooltip contained the title, all six category labels, and 100/98/92/80/73/98 ratings, but every bar looked empty because `.tooltip-fill` was an inline `<i>` with no `display:block`, so its width and height were ignored. The saved-people button used Lucide `users.svg`, not a bookmark.
- Fixed `.tooltip-fill` with `display:block`, replaced the header library icon with `bookmark.svg`, and added regressions for visible tooltip fill boxes and the bookmark mask. Bumped the service-worker cache to `zg852-v47` and synced `tests/audit-sw.spec.js`.
- `npm run lint` passes and the full CI-mode Playwright suite passes 116/116. These newest fixes are uncommitted; deploy and live re-verification are next.

## 2026-11-24T08:45:33Z

- CI run `45356656564` failed at `npm test` on `tests/map-fixes.spec.js` near-tied travel times; the same test passed locally without `CI=true` and passed on immediate reruns, so I reproduced and instrumented the flake.
- Root cause: the production service worker installs with `skipWaiting()`/`clients.claim()` and can take over the page mid-test. `page.route()` does not intercept service-worker requests, so later same-origin fetches (`data/network.json`, `data/hkbus.json`) sometimes loaded real data while `data/nodes.json` used the four-node synthetic stub, producing `TypeError: Cannot read properties of undefined (reading 'push')` and `data-net="error"`.
- Fixed the test deterministically: `tests/map-fixes.spec.js` now sets `test.use({ serviceWorkers: 'block' })` and serves all synthetic data through one wildcard `**/data/*.json` route. Twelve consecutive `CI=true` runs of the previously flaky test passed.
- Full-suite verification, commit, push, and live deployment are pending; the earlier push did not deploy because its CI test job failed.

## 2026-11-24T08:26:32Z

- Integrated verification found one regression: the adaptive deck placed the first start field below the 300px keyboard zone on a 360×640 phone. Fixed it in `src/js/ui.js` by snapping the sheet to `full` and scrolling the focused start field into view, and retargeted the e2e assertion to verify that focus behaviour.
- `npm run lint` is clean (15 catalogues, 160 keys each, 108 literal keys verified). The full Playwright suite now passes 115/115 against built `public/`; the earlier run was 114 passed with only the keyboard-zone assertion failing.
- All fix-round changes remain uncommitted and unpushed; next steps are final diff review, commit, push, CI/deploy verification, and live-site checks.

## 2026-11-24T08:14:40Z

- Map/engine workstream reported complete: adaptive deck now covers narrow fine-pointer viewports, selection persists and clears stale point banners, heat-cell focus tooltips work, recenter includes selected cells, route legs retranslate, meeting-suitability breaks near ties, and typed-origin validation is wired from `engine.compute()`. Reviewed diffs; the main integration dependency is `hasPendingOrigins()`/`search.selectSuggestion` from the remaining UI stream.
- Seven deterministic regression tests were added in `tests/map-fixes.spec.js`.

## 2026-11-24T08:09:46Z

- CI workstream reported complete: mobile heat/point taps now wait for the full search and poll the sheet transition; result-row tests expect listitem wrappers around native buttons; CI gained concurrency cancellation, timeouts, `CI=true`, and one retry; `tests/ci-workflow.spec.js` was added. Reviewed diffs; changes are consistent with the pending UI wrapper fix.
- Still waiting on UI/autocomplete/i18n and map/engine/routing streams.

## 2026-11-24T08:09:18Z

- State workstream reported complete: one-person scenarios now persist, malformed/one-person share hashes raise inline errors, and `tests/state-fixes.spec.js` was added. Reviewed the diff; the existing `state.js` → `ui.js` import cycle is unchanged apart from adding `showError`, and `app.js` still calls `restoreSelection()` after `renderEmpty()` so the pending share error is flushed correctly.
- Still waiting on UI, map/engine, and CI streams before integration and verification.

## 2026-11-24T08:07:31Z

- Confirmed scope with user: fix all 25 findings (20 from `docs/new-audit-round2.md` plus the five live defects) and repair GitHub CI; publish by pushing/deploying after verification.
- Launched four non-overlapping workstreams: state/share persistence, UI/autocomplete/i18n/accessibility, map/engine/routing/layout, and CI/test hardening. Each owns disjoint files and adds Playwright regressions.
- Bumped service-worker cache `zg852-v45` → `zg852-v46` and synced `tests/audit-sw.spec.js`; confirmed `origin/main` is reachable and still at `a7caad2`.
- No integration run, commit, push, or deploy yet; waiting for the four streams to report before running lint/build/full suite.

## 2026-11-24T06:27:16Z

- Drove the live https://zg852.pages.dev/ with Playwright at 393×659 and 1440×900: clean first run, suggestion-click journey (Central + North Point) produced ranked areas, fares, routes and map paths; locale switch translated chrome but left route step words/stop names in English.
- Reproduced two high-severity live defects: typing "Kowloon Tong" without clicking a suggestion left the stored origin as Tsuen Wan and the search used Tsuen Wan; removing Person B, setting Central and reloading restored default Tsuen Wan/North Point (one-person state loss).
- Noted a utility limitation: top-ranked "fair areas" can be road/bus interchanges (e.g. Western Harbour Crossing Bus-Bus Interchange), which are not practical meeting spots.
- Confirmed deployment lag: live SW is `zg852-v42` and `origin/main` is `a7caad2`, while local HEAD `c67964e` is 9 commits ahead at `zg852-v45`; the recent fixes are not public. Local `npm test` still passes 98/98 and lint/i18n passes.
- Gave an honest verdict: genuine niche utility, but not ready for unsupervised public use; beta/demo only until the two data-integrity bugs are fixed and pending commits are deployed. No application code changed; screenshot saved under ignored `.playwright-mcp/`.

## 2026-11-24T06:18:38Z

- Answered a readiness/utility judgment call: the app has a real, specific use case for choosing fair meeting points by travel time, but the fresh audit's remaining high/medium defects (typed origin ignored, one-person state loss, silent 8-person limit, late autocomplete reopening, navigation and i18n issues) mean it is suitable for a labelled beta/demo, not unsupervised public production use. No code changes were made.

## 2026-11-24T06:08:11Z

- The temporary built-output audit server on `127.0.0.1:8878` reached its 900-second timeout and stopped cleanly (SIGTERM). This does not affect the completed round-2 findings or any files; no server restart is needed unless further browser checks are requested.

## 2026-11-24T06:02:02Z

- Ran a fresh Playwright audit against built `public/` on desktop, 800×600 fine-pointer desktop, iPhone 15, coarse landscape/tablet, RTL/i18n, dialogs, share links, persistence, autocomplete and offline paths. Excluded all 20 issues from `docs/full-audit.md`; found 20 new reproducible problems.
- Wrote `docs/new-audit-round2.md` with exact repro steps and browser evidence. Highest-impact new issues: typed start-place text is ignored unless a suggestion is clicked, deleting down to one person restores both defaults on reload, the 8-person limit silently no-ops, result rows lose button semantics, late Photon responses reopen dismissed suggestions, narrow fine-pointer desktops still use the stacked layout, and the Process dialog body link navigates away from the app. Raw probe reports and screenshots are under `/tmp/opencode/`.
- No application source was changed in this audit round; only `docs/new-audit-round2.md` was added and `observations.md` updated. Local HEAD remains `c67964e` and nothing was pushed.

## 2026-11-24T05:42:33Z

- Integrated all five audit workstreams into main and resolved the two cross-stream regressions: the shared pinned-point test now waits for results before expecting the banner (matching the new pre-Search gating), and default-name detection is position-aware so a saved profile called `Person B` is not renumbered to `Person D` when added as the fourth person. `profileFromPerson()` now preserves an explicit profile name. Bumped SW cache `zg852-v44` → `zg852-v45` and synced the SW test.
- Committed `docs/full-audit.md` as `87e98e1` and the integration fixes as `c67964e`. Final verification clean: lint/i18n (15 catalogues, 156 keys each), build with 28 precompressed assets, all 98 Playwright tests against built `public/`, and `git diff --check`. Only `observations.md` remains locally modified.

## 2026-11-24T05:36:42Z

- Merged the map workstream from `f2443cf` into main as `c0ac7ba`: fitBounds now uses separate top/bottom padding so the mobile sheet is not double-counted, recenter includes the pinned point, heat cells are keyboard-accessible with localized labels, and early Unlimited taps show an inline loading error. Integration lint and build remain clean; agent reported 74/74 tests in its worktree.

## 2026-11-24T05:33:48Z

- Merged the state/persistence workstream from `31f112b` into main as `d98d570`: startup fetches/storage are guarded with inline errors and `data-net="error"`, directory IDs/sequence and deliberate empty directories persist, shared scenarios and selection survive hash cleanup, and default names no longer freeze English literals. Integration lint and build pass with 28 precompressed assets.

## 2026-11-24T05:32:47Z

- Merged the UI/i18n workstream from `01ea4e8` into main as `a82ca39`: pin mode clears on person removal, recomputes no longer force the Results pane, locale switches preserve active search state, renames refresh result/step labels, result/directory rows gain listitem semantics, and the Unlimited hint is gated on a solved/completed search. Updated `tests/e2e.spec.js` and committed `2d08c68` so the old test now expects the hint only after Search.

## 2026-11-24T05:28:02Z

- Merged the service-worker/payload workstream from worktree commit `3c3a3ee` into main as `5061828`: normalized cache keys ignore query strings (fixes offline map worker), only OK same-origin responses are cached, build now emits deterministic `.gz` variants with `_headers` rules, cache bumped to `zg852-v44`, and `tests/audit-sw.spec.js` added. Agent reported lint/build plus targeted SW and production-smoke specs passing; raw payload on hosts without compression remains a deployment limitation.

## 2026-11-24T05:23:59Z

- User confirmed “these as well” meant all 20 audit findings, not a missing attachment. Committed the unbounded pinned-point tooltip fix as `7da9270` after lint, build and 71/71 Playwright tests passed.
- Created five isolated worktrees and dispatched non-overlapping fix streams: state persistence (issues 2–5, 19), UI/i18n (10–13, 17–19), map fitting/access (1, 17, unbounded safety), responsive CSS (6–9, 14), and service worker/payload (15, 16, 20). Each stream owns disjoint files, adds its own regression spec, runs lint/build, and commits locally for later merge.

## 2026-11-24T04:56:39Z

- Finished the full PC/mobile qualitative audit against built `public/` via Playwright MCP (1440×900 desktop, iPhone 15 393×659, 852×393 landscape, 768×1024 coarse tablet, 320×568) plus read-only source review. Wrote `docs/full-audit.md` with 20 prioritized very-bad issues and concrete reproduction/evidence; no application code was changed.
- Live-confirmed the strongest findings: mobile fitBounds double-counts the sheet and hides routes; blocked `nodes.json` or throwing `localStorage.setItem` blanks the app with no inline error; saved-people IDs collide after reload causing wrong-record edit/delete; deleting all saved people resurrects them on reload; shared scenarios vanish on reload in a fresh context; removing a pinned person leaves pin mode stuck; mobile recomputes force the Results pane; locale switching wipes place queries/focus and leaves default Person A/B names; renaming a person leaves stale result/step text; Unlimited mode advertises map taps that do nothing before Search.
- Recalled prior live evidence for desktop footer overlap, RTL horizontal overflow, landscape/tablet stacked fallback, tiny mobile results sheet, offline worker errors, hidden mobile attribution/legend, inaccessible heat cells/list semantics, and the ~10MB uncompressed asset payload. Diagnostics export, legal dialogs, clipboard share, basic autocomplete, and offline data/search mostly worked and were excluded from the top 20.
- Reconciled two read-only static audit reports; their file:line root causes (especially `src/js/map.js:126-132`, `src/js/state.js:67-74,112-124`, `src/js/ui.js:232`, `static/sw.js:8-10`) were folded into the durable audit note. Working tree now contains `observations.md` and the new `docs/full-audit.md` only.

## 2026-11-24T04:51:41Z

- Ran a read-only static audit of `src/`, `static/`, `scripts/`, config and data flows at `a7caad2`; no app code, tests, config or assets changed and no Playwright was used. Highest-severity findings with exact evidence: mobile fitBounds double-counts the sheet in both padding axes (`src/js/map.js:126-132`); shared scenarios are stripped from the URL but never persisted (`src/app.js:25`, `src/js/state.js:112-124`); deleting all saved profiles is undone on reload (`src/js/state.js:67-74`); `directorySeq` is not restored so new profiles collide with persisted `d1`/`d2` ids (`src/js/store.js:5`, `src/js/state.js:41-42,67-74`); removing a pinned person leaves pin mode stuck (`src/js/ui.js:232`); unguarded init fetches and localStorage writes leave a blank app (`src/app.js:18,88`, `src/js/data.js:19,42`, `src/js/state.js:34-39,65`); shared pinned-point selections are never restored (`src/js/map.js:209-219`, `src/js/state.js:86-88`); Unlimited taps do nothing before the first Search (`src/js/map.js:82-86,294-295`).
- Medium findings: locale switches destroy in-progress input/focus (`src/js/i18n.js:101`, `src/js/ui.js:242-247`); Photon cache ignores locale (`src/js/search.js:48-55,69`); renaming a person does not refresh result rows (`src/js/ui.js:214`); mobile recomputes force the Results pane (`src/js/ui.js:107`); autocomplete never updates `aria-selected` and short ASCII edits leave stale requests (`src/js/ui.js:150-163,221-228`); service worker caches non-OK responses (`static/sw.js:8-10`); `role="list"` containers have no listitem children (`src/index.html:192,220`); invalid share hashes and library filters persist (`src/js/state.js:105-116`, `src/js/ui.js:355-358`). Reported as a prioritized list to the parent session.

## 2026-11-24T04:48:28Z

- Completed the read-only audit at `a7caad2` against built `public/` output, with short Playwright probes only (no builds/test suite). Confirmed high-severity failures: mobile route fitting double-counts the bottom sheet and puts selected points off-screen; deleting all saved people is undone on reload; reloaded saved profiles reuse `d1`/`d2` IDs so edit/delete hits the wrong profile; removing a pinned person leaves pin mode stuck; pin mode is unusable in Unlimited before Search; shared scenarios disappear on reload once the hash is consumed; and init failures leave a blank app with no inline error.
- Also confirmed medium-severity UX/i18n/state issues: mobile recomputes force the Results pane; locale switching destroys an in-progress place query and focus; Photon results are cached by query only, so locale changes reuse old-language labels; renaming a person does not refresh existing result/route text; library search filters persist across reopening; invalid share hashes are not cleared; suggestion options never update `aria-selected`; service-worker fetch caching stores non-OK responses; and unguarded localStorage writes can break startup/locale changes. No app source, config, tests, or static assets were changed.

## 2026-11-24T04:28:17Z

- Confirmed the final mobile command-deck work is pushed as `39466d5` (`feat: adaptive mobile command deck for phones`) and the working tree is clean. The implementation adds the iPhone 15 audit, mobile-only bottom sheet/navigation, magnetic heat-cell selection, 44px touch targets, safe-area handling, mobile Playwright coverage, and a desktop guard test; lint, i18n checks, 71/71 tests, build and diff checks all passed.

## 2026-11-24T04:27:53Z

- Committed the mobile command-deck work as `1091919` (`feat: adaptive mobile command deck for phones`) and pushed it to `origin/main`. Working tree is clean.

## 2026-11-24T04:27:27Z

- Installed the Playwright MCP project-locally via `opencode mcp add playwright` (`opencode.json`) and confirmed it connected. Installed the WebKit browser binary too; the live audit used Chromium with the iPhone 15 descriptor because that was the running MCP session and the existing suite uses Chromium.
- Audited the built `public/` output on a 393×659 CSS / 393×852 screen iPhone 15 viewport. Recorded the findings in `docs/mobile-audit.md`: a 1,342px stacked page in a 547px scroller, sticky footer overlapping parameters and results, a tiny 240px map that scrolls off-screen, route detail overflowing the map because `flip-in` was never removed, 4px heat cells, hover-only tooltips, 35/54 sub-44px controls, 14px inputs that trigger iOS zoom, no safe-area handling and a click-blocking unbounded hint.
- Implemented an adaptive command deck for coarse-pointer phones: the map is now the full-height base layer and the two existing sidebars become one bottom sheet with People / Areas / Route panes, three snap points, a draggable handle and a mobile nav. Desktop CSS/JS behavior is gated off by `@media (max-width:480px) and (pointer:coarse)`.
- Added magnetic heat-cell selection: taps within 56px of a heat-cell centre select the cell and show the six-bar tooltip immediately. Selection fitting now reserves padding for the nav and sheet. Fixed the stale `flip-in` class so route detail no longer collapses its grid row, and made beta preference sliders scroll inside the sheet instead of hiding results/legal links.
- Normalized mobile controls to 44px minimum, text inputs to 16px, added safe-area padding, compacted the options grid, made the unbounded hint pointer-transparent, hid low-value map legend/attribution on phones and bumped service-worker cache `zg852-v41` → `zg852-v42`.
- Added five iPhone 15 Playwright tests plus a desktop guard test. Verification clean: `npm run lint` (156 keys × 15 catalogues), `npm test` 71/71, `npm run build`, `git diff --check`. Changes are staged/committed next.

## 2026-11-24T04:00:07Z

- Made the POI index load unconditionally at startup instead of only when beta vectors are enabled, and stopped `applyBetaFeatures()` from clearing it. Interest ratings are therefore available in bounded and unbounded modes; beta still only controls the preference sliders and their ranking effect.
- Fixed the bounded-mode heat-cell tooltip. It now always renders “Area interest fit” with six category-label + filled-bar rows, no scores and no counts, instead of the near-empty title-only tooltip.
- Converted the rightbar interest panel into a native `<details>` accordion with an “Interest ratings” summary. Removed the overall `/100`, per-category `/100`, counts, scale note, and preference sentence; the panel now contains only category labels and bars.
- Unbounded pinned-point results now compute `fit`/`vector`/`count`/`ratings`/`rating` from the POI cell key of the nearest transit node, so the interest accordion also appears for pinned points. Removed the old `betaVectorsEnabled() && !r.point` gate.
- Removed the unused `vector.ratingScale`, `vector.overall`, and `vector.rating` keys from FALLBACK and all 15 catalogues (156 keys). Bumped service-worker cache `zg852-v40` → `zg852-v41`.
- Verification clean: `npm run lint` (156 keys × 15 catalogues, 106 literal keys), `npm test` 65/65, `npm run build`, `git diff --check`. Changes are in the working tree but not yet committed.

## 2026-11-23T17:09:40Z

- Replaced the literal “Diagnostics beta” footer text with a muted download icon button in `.legal-links` after Process. It is hidden by default and only shown by `applyBetaFeatures()` when beta vectors are on; accessible label/tooltip remain, and the unused `diag.beta` key was removed from FALLBACK and all 15 catalogues (159 keys).
- Reworked the beta map tooltip: it now shows only the category label plus a filled normalized bar for each of the six interests. Removed the per-category `/100` values, counts, and overall numeric score from the tooltip; the bars are still set from the existing 0..1 log-normalised POI values.
- Fixed the pinned-point route display. `describe()` now merges adjacent walk legs before building legs/fares, so a walk-only route to a pin shows one continuous walk instead of “Walk 6 min” followed by “Walk 2 min to Pinned point”. Total journey time and fare now render together in one `.route-meta` line per person instead of on separate rows.
- Preserved the earlier fixes: one-line tolerance explanation, no headway help text, sticky footer, per-category interest ratings in the detail panel, full MTR names, integer minutes, search flipping to detail, i18n parity, and no raw keys.
- Bumped service-worker cache `zg852-v39` → `zg852-v40`. Verification clean: `npm run lint` (159 keys × 15 catalogues, 106 literal keys), `npm test` 65/65, `npm run build`, `git diff --check`. Changes are in the working tree but not yet committed.

## 2026-11-23T16:57:47Z

- Corrected the previous misread: diagnostics is now a muted text button beside Process in the rightbar footer with a small `beta` superscript, and its status output lives in the footer. Removed `data-i18n` from the button element because the i18n pass replaced its child markup and hid the beta tag.
- Replaced the long tolerance paragraph with one sentence: “How much longer the slowest trip may be than the fastest, as a percentage.” in FALLBACK and all 15 catalogues.
- Built the missing interest-rating UI the user expected. `src/js/vectors.js` now exposes `categoryRating()`, `cellRatings()`, `overallRating()`, and `ratingText()` over the existing per-category log-normalised 0..1 POI values. `cellToResult()` carries `ratings` and `rating` into results and diagnostics.
- Interest ratings now appear in two places when beta vectors are on: the selected-area detail panel has an “Interest ratings” card with an overall `/100` score plus six category rows (label, count, bar, `/100` value), and the delayed map tooltip shows the same normalized ratings per category with the overall score/preference. Added four localized keys across all catalogues (160 keys total).
- Added coverage for the beta tag placement, one-line tolerance copy, six detail rating rows, overall rating format, and tooltip ratings. Fixed a CSP regression by setting bar widths via JS after insertion instead of inline `style` attributes.
- Verification clean: `npm run lint` (160 keys × 15 catalogues, 107 literal keys), `npm test` 65/65, `npm run build`, `git diff --check`. Bumped service-worker cache `v38` → `v39`. Changes are in the working tree but not yet committed.

## 2026-11-23T16:48:07Z

- User was unhappy with the prior terse summary; clarified the exact changes made in `7d862b5`: icon-only diagnostics button beside the tolerance label, headway help removed, tolerance label replaced by the 300%/unlimited explanation, sticky rightbar footer restored, plus i18n cleanup and SW cache bump.

## 2026-11-23T16:45:11Z

- Committed and pushed the Parameters/footer fixes as `7d862b5` (`fix: tighten parameters copy and restore sticky footer`); `origin/main` is current and the working tree is clean.

## 2026-11-23T16:44:50Z

- Reworked the Parameters block from user feedback: removed the headway help sentence entirely, moved the 300%/unlimited explanation into the tolerance label itself, and deleted the now-duplicated `options.headwayHelp` and `options.toleranceHelp` keys from FALLBACK and all 15 catalogues (155 keys).
- Turned Download diagnostics into a tiny 22×18 icon-only button beside the tolerance label/value, using a muted Lucide download icon that only gains accent color on hover/focus; tooltip and live status remain for accessibility.
- Restored a sticky rightbar footer with `position: sticky; bottom: -16px`, a solid surface background, and matching padding/margins so it stays visible while results scroll. Added a CSS assertion to the sticky-layout test.
- Bumped service-worker cache `zg852-v36` → `zg852-v37` and updated DESIGN.md. Verification clean: `npm run lint` (155 keys × 15 catalogues, 106 literal keys), `npm test` 64/64, `npm run build`, `git diff --check`. Changes are in the working tree but not yet committed.

## 2026-11-23T16:40:05Z

- Confirmed `origin/main` points at `d86425c`, with `73f6fa2` immediately behind it and a clean working tree.

## 2026-11-23T16:16:30Z

- Removed two accidental `chi_tra.traineddata` / `eng.traineddata` files that the temporary Tesseract.js OCR run cached in the repo root and that were included in `73f6fa2`; these are tooling artifacts, not app assets.

## 2026-11-23T16:15:57Z

- User reported the social thumbnail still showed "Zak Geok". Confirmed the text was baked into `static/og-image.png` (OCR found title at x504–816, y306–359 and stale subtitle "Fair Hong Kong meeting points by travel time and cost."), not present in HTML or i18n.
- Image-generation service failed with `Invalid credential`, so edited the PNG directly with PIL after locating exact text bounds via Tesseract.js OCR. Replaced the dark-panel text block with title `就腳 zau6 goek3` and subtitle `Find the most convenient meeting point / for everyone`, preserving the 1200×630 size, dark background, red left panel and all untouched pixels.
- Added `?v=2` to the `og:image` and `twitter:image` URLs in all five HTML pages so social crawlers that cached the old thumbnail fetch the new one; added regression assertions to the brand and legal-page tests.
- Bumped service-worker cache `zg852-v35` → `zg852-v36` because the cached OG image changed.
- Verified post-edit OCR no longer finds "Zak Geok"; `static/og-image.png` and built `public/og-image.png` have identical SHA-256. `npm run lint`, `npm test` 64/64, and `git diff --check` all pass. Changes are in the working tree but not yet committed.

## 2026-11-23T15:50:06Z

- Committed the next-round feature set as `1c57238` (`feat: add ride diagnostics, free-point picking and transit link details`, 35 files) and pushed to `origin/main`; working tree clean.

## 2026-11-23T15:49:27Z

- Implemented the full next-round feature set on top of `cfd22f5`: ride chips now render `from → to` with a red U+2192 arrow and wrap naturally; MTR legs carry a per-line colored dot via CSS `data-line` selectors; bus route numbers link to hkbus.app; the tolerance slider runs 5%–300% with 300% still using the normal filter and one extra 305% "Unlimited" stop that hides the heatmap and lets the user click any map point; pinned points route to the nearest reachable stop plus a localized final walk leg and have an explicit Clear button; a Download diagnostics control exports a timestamped JSON snapshot and copies the same text to the clipboard.
- Generated `static/data/hkbus.json` from the public hk-bus-crawling route list with `scripts/build_hkbus_urls.py`; all 2,822 bus lines mapped, 65 fullwidth-slash slugs fall back to `/en/search` because hkbus.app publishes but 404s those pages. A 50-link random sample returned 48 HTTP 200 and only the two known fullwidth-slash failures before the fallback was applied.
- Added config helpers/constants for tolerance normalization, unbounded mode, MTR line colors and the hkbus fallback; wired shared state so saved/shared tolerances above 50% are no longer clamped and free-point selection can be shared; added `src/js/diagnostics.js` with settings, people, solve key, hotspots, selected area and all route leg detail.
- Added 12 localized keys across FALLBACK and all 15 catalogs (157 keys total), including tolerance help/unlimited labels, pinned-point copy, bus-link tooltip, diagnostics status text and `route.walkTo`; no raw i18n keys leak.
- Bumped service-worker cache `zg852-v34` → `zg852-v35`, added `data/hkbus.json` to the precache list and to `scripts/finalize.mjs` deployed-data allowlist.
- Extended Playwright coverage for arrow color/wrapping, MTR dots, hkbus links, the 5%/300%/Unlimited slider flow and free-pick clear, diagnostics download+clipboard, catalog parity and hkbus precache. Fixed one UX gap found by tests: the final walk to a pinned point now says "Walk N min to Pinned point" instead of a generic walk label.
- Verification clean: `npm run lint` (157 keys × 15 catalogs, 108 literal keys), `npm test` 64/64 passed against built `public/`, `git diff --check`. Changes are staged in the working tree but not yet committed.

## 2026-11-23T14:20:38Z

- Committed the full Parameters/settings change set as `cfd22f5` (`feat: rename options to parameters and simplify trip settings`, 36 files) and pushed to `origin/main`; working tree clean.

## 2026-11-23T14:20:13Z

- Tests/docs subagent finished: locale and add/remove-person tests now account for search revealing the detail face; all face/swap assumptions audited. Docs updated newest-first in DESIGN.md, README.md, process.html, PRIVACY.md and privacy.html.
- Fixed one flaky assertion in the new headway-persistence test: it waited to observe a transient "Working" label, which the debounced recompute can skip; replaced with an explicit `#go` search as the deterministic sync point.
- Final verification clean: `npm run lint` (145 keys × 15 catalogs, 99 literal keys), `npm test` 62/62 passed against built `public/`, `git diff --check`. Ready to commit and push.

## 2026-11-23T14:17:57Z

- Reviewed all four completed subagent diffs: engine/state search reveal and `includeHeadway` solveKey, routing fare-mode removal and interchange gating, UI Parameters/headway/arrow changes, and i18n (145 keys, Unicode arrow in every catalog). No stale `fairnessMetric`/`fareTimes`/Get on/Get off references remain outside the still-editing tests.
- Confirmed full MTR names come from `line.n` (e.g. "Tuen Ma Line") and bus chips still show route numbers; leg chips use `route.stops` with `→`.
- Bumped service-worker cache `zg852-v33` → `zg852-v34` because index.html, CSS and all i18n catalogs changed. `finalize.mjs` patch token is unaffected.
- Flagged one stale test assumption to the tests/docs agent: the locale test clicked `#swapFace` after `#go` expecting the people face, but search now reveals detail first. Docs review otherwise clean.

## 2026-11-23T14:14:57Z

- UI/DOM/CSS subagent completed the Options→Parameters, fairness removal, headway control, saved-people summary removal, arrow leg chips, time-only result/detail text, and sticky-rightbar gap contract in the four owned files (`src/index.html`, `src/js/ui.js`, `src/js/map.js`, `src/styles.css`) only.
- Exact DOM changes: rightbar aside aria-label is now "Parameters and results" and the `options.title` fallback text is "Parameters" (key unchanged); the `.fairness-section` block was replaced by `.headway-section` with `#includeHeadway` checkbox plus `.headway-help` note after the mode chips; `#saveSummary` was deleted. `ui.js` now wires `#includeHeadway` in `updateSettingsLabels()/applySettingsToDom()/readSettingsFromDom()`, no longer exports `updateSaveSummary()` or its `refreshMeta()` call, dropped the `money` import and all `fairnessMetric` reads/writes, and renders plain `results.spread`/`results.longest`. `map.js` legChip() renders one `.leg-stops` span with `route.stops` ("from → to"), keeps full line names/fare/wait spans, and `renderSelection()` uses time-only `#detailSub`; `money` import retained for leg fares.
- Follow-up integrated: `buildResultFromCell()` now calls `prepareRoutes(cellToResult(cell),active)` with no third metric arg; grep confirmed zero `fairnessMetric`, `.fares`, fairness/save-summary selectors or Get on/Get off markup in the owned files, and no stale `money` import in `ui.js`.
- CSS: `.side-right{padding-top:0}` with `.side-right::before{margin-top:12px}` (reset to 0 on mobile) and `.options-panel{padding:12px 0}` (reset `padding-top:0` on mobile) so the sticky panel sits flush at the scrollport top on desktop with no mobile gap; removed fairness/focus/save-summary rules, added compact `.headway-section`, `.toggle-row` (+ checkbox alignment/accent) and `.headway-help` rules, and folded the old `.leg-board/.leg-alight` wrapping into `.leg-stops`.
- `npx eslint src/js/ui.js src/js/map.js` passed with no output; `npm test` deliberately not run and nothing committed.

## 2026-11-23T14:13:54Z

- Routing subagent completed the fare-mode removal and `includeHeadway` contract in `src/js/routing.js` only: `solve(sources,mask,maxTime=180)` has no `mode`/`fareMode`/`arrival`/`fare` path and charges `w + (include && line===BOARDED && isNum(info.h) ? info.h : 0)` on boarding; the `fareTimes` export is deleted while `bestTimes`, `walkTimes` and all other exports remain.
- `buildCells(grids,tolerance,budget)` is time-only again (no `metric`/`fareGrids`/`cell.fares`), `cellToResult()` no longer returns `fares`, `describe(sol,origin,target,walkMinutes=WALK_TOLERANCE_DEFAULT)` and `prepareRoutes(result,active=store.activePeople)` lost their `metric` args and sort time-then-fare, and a new ride leg's `interchangeWait` is 0 unless `store.settings.includeHeadway!==false`. `rideLegText()`/`interchangeWaitText()` wording and full MTR line names are untouched; `routeFares()`/`fareMarkup()` still provide per-route fare estimates.
- `npx eslint src/js/routing.js` and an ESM `node --check` pass. Full `npm run lint` still reports cross-agent errors in `engine.js` (`fareTimes` use, unused `setSidebarFace`) and `ui.js` (undefined `money`) — the owning agents must remove those. No commit; `npm test` deliberately not run per contract.

## 2026-11-23T14:12:42Z

- User requested eight changes: replace Get on/Get off with a "Start → End" Unicode-arrow display using full line names; make Search flip the leftbar to route detail; add a parameter controlling inclusion of average headway; remove "Travel Priority"; fix the rightbar scroll gap above the sticky panel; rename Options to Parameters; remove the "N saved: …" summary.
- Clarified two ambiguities with the user: "Travel Priority" means the global Fairness metric (Time/Fare) control, which is to be removed entirely (time-only ranking); and Search SHOULD autoswap the leftbar to detail.
- Found the old per-person label was literally "Travel priority" (`people.focusLabel`) and is already gone from source/catalogs/build; the new global Time/Fare toggle was the lookalike being objected to.
- Launched five subagents with disjoint ownership: settings/state/engine/search reveal, routing simplification, UI/DOM/CSS (including sticky-scroll fix), i18n key cleanup/rename, and tests/docs.

## 2026-11-23T13:53:35Z

- Integrated the interchange-wait refinement from all five subagents: GTFS data now exports `w` (fixed boarding penalty) and `h` (capped duration-weighted half-headway); the solver uses a FRESH/BOARDED foot-state bit so `h` is charged only at interchanges; ride legs carry `interchangeWait` and show a whole-minute "Interchange wait N min" note in chips, steps and tooltips; SW cache is `zg852-v33`.
- Fixed one stale assertion: removing first-boarding headway makes the default scenario favour buses, so the default test no longer requires rail chips; full MTR names remain covered by the dedicated rail and fairness tests.
- Verification clean: `npm run lint` (151 keys × 15 catalogs), `npm test` 61/61 passed against built `public/`, and `git diff --check`. Ready to commit and push.

## 2026-11-23T13:49:23Z

- Solver/presentation subagent completed the interchange-wait contract in `src/js/routing.js` only: state encoding is now `stride=lines.length+2`, `FRESH=-2` (offset 0, seeded sources), `BOARDED=-1` (offset 1, alighting target), lines `>=0` (offset `line+2`), `start=-1` sentinel unchanged; foot walking stays in the same state, and boarding charges `w + (line===BOARDED && isNum(info.h) ? info.h : 0)` in both time and fare-mode arrival budgets.
- `describe()` now enumerates final states from `-2`, decodes `line=(st%stride)-2`, marks each new ride leg with `interchangeWait` when the previous chain state is a boarded foot state (`pst!==start && pst%stride===1`) using `info.h`, and keeps boarding time/wait only in `stepT` (no double-add). Also updated the pure-walk candidate test to `c.line===-2` because `-1` now means "on foot after riding".
- Added exported `interchangeWaitText(leg)` and used it inside `rideLegText()` for the `route.interchangeWait` note; all other exports/signatures unchanged. `walkTimes()` still uses `k%stride===0`.
- `npm run lint` passed (including 15-catalogue i18n parity). Confirmed the other agents' i18n key and `map.js` legChip import of `interchangeWaitText` are already present and compatible. No commit made; `npm test` deliberately not run.

## 2026-11-23T13:49:34Z

- UI subagent for interchange-wait display: added `interchangeWaitText` to the routing import in `src/js/map.js` and appended a `<span class="interchange-wait">` after the fare span inside `.leg-meta` in `legChip()` (ride legs only, empty when helper returns ''); left leg labels, tooltips, result rows, subtitle and reveal behaviour untouched.
- Added a compact `.interchange-wait{font-size:11px;color:var(--muted);font-weight:400}` rule to `src/styles.css` beside the `.leg-meta`/`.fare` rules; no :root or layout changes.
- `src/js/ui.js` needed no edits: it renders no route leg text (result rows only show names/times/fares), and detail steps already go through `legChip()`; tooltips are covered by `rideLegText()` in routing.js.
- Verified with `npx eslint src/js/map.js src/js/ui.js src/styles.css` (0 errors; CSS ignored by eslint config) and reviewed `git diff`; did not run `npm test` per shared-tree instruction and did not commit.

## 2026-11-23T13:48:35Z

- User refined the boarding-wait model: the half-headway should only apply when boarding at an interchange (after an earlier transit leg), because the first departure can be timed; the interchange wait must also be visibly noted.
- Designed the change: split GTFS data into `w` (fixed boarding penalty, every boarding) and `h` (capped half-headway, interchanges only); extend the solver state with a "has boarded" foot state so the extra wait is charged only after alighting; surface `leg.interchangeWait` via a new `route.interchangeWait` i18n key in leg chips, steps and tooltips; bump SW cache to v33.
- Launched five parallel subagents with disjoint ownership: GTFS data fields, solver/presentation logic, UI display, i18n key, and tests/docs.

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
