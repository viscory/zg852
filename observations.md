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
