# Project instructions

- At the end of every assistant turn, prepend a timestamped block to `observations.md` summarizing what you learned and did in that round. Never edit, reorder, or delete existing blocks; insert only at the top.
- Run Playwright against the built `public/` output, never the source tree. `npm test` builds and serves `public/` automatically.
- Bump the service-worker cache version in `sw.js` when changing cached assets, and keep the patch strings in `scripts/build-pages.mjs` in sync.
- Keep user-facing copy in `i18n/*.json`; treat the text in `index.html` as a no-JavaScript fallback only.
- The recenter control belongs on the map beside the Leaflet zoom control, not in the right sidebar.
- Route-affecting changes must call `scheduleRecompute()` so results update without pressing Search.
