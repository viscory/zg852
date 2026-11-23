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
