# Project instructions

- At the end of every assistant turn, prepend a timestamped block to `observations.md` summarizing what you learned and did in that round. Never edit, reorder, or delete existing blocks; insert only at the top.
- Run Playwright against the built `public/` output, never the source tree. `npm test` builds and serves `public/` automatically.
- Deployable sources live in `src/`; the build copies them flat into `public/`. Do not serve or test the source tree directly.
- Bump the service-worker cache version in `src/sw.js` when changing cached assets, add new `src/js/` modules to its asset list, and keep the patch strings in `scripts/build-pages.mjs` in sync.
- Keep user-facing copy in `i18n/*.json`; treat the text in `src/index.html` as a no-JavaScript fallback only.
- Shared mutable state lives in the `store` object in `src/js/store.js`; modules own behaviour, the store owns state.
- The recenter control belongs on the map beside the Leaflet zoom control, not in the right sidebar.
- Route-affecting changes must call `scheduleRecompute()` so results update without pressing Search.
