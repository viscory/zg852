# 就腳

Client-side Hong Kong fair meeting-point finder. Pick two or more start places and see fair areas on the map with segmented walking, MTR, bus, light rail and ferry routes, all within a fixed 90-minute travel cap. No account, no backend, no API keys.

Site: https://zg852.pages.dev/

## Using it

Each person card has a walk tolerance slider: 0–60 minutes in 5-minute steps, 20 minutes by default. It stays per person and is saved with the person, in saved profiles, and in share links.

The right sidebar's **Parameters** panel holds the transport modes, a **Time / Fare** fairness toggle, the percentage tolerance for the active metric, and an `Include average headway` checkbox. Time mode filters by travel-time disparity and ranks by a stored fit score (whole-minute longest + spread), then the displayed longest and then the displayed spread. Fare mode keeps the 90-minute trip budget, keeps the time-disparity filter (only the ranking changes), and ranks the time-feasible pool by the displayed fare gap, then the highest fare. MTR fares come from the MTR station-pair snapshot, bus and ferry fares are the Transport Department published adult full-route fares for those lines (not segment fares), and distance-band estimates are used only when a snapshot lookup is missing. The slider starts at 5%, runs linear in 1% steps to 100%, logarithmic to 300%, then Unlimited, and each metric keeps its own tolerance. The headway checkbox is on by default and travels with settings and share links; with it on, half of a frequency-weighted service-day average wait is charged only when you change between transit legs (a default applies when a line publishes no frequency data) and appears as an `Interchange wait N min` note in the steps and tooltip. The first departure assumes you time yourself. Turn the checkbox off and no headway wait is charged or displayed.

Minute values are whole numbers, and MTR legs use full line names such as `Tuen Ma Line` or `Tsuen Wan Line`, never three-letter codes. Each ride chip shows its boarding and alighting stops as `Start → End` with a Unicode arrow. Pressing Find fair areas in the parameters panel, or Plan a meet (`#goPlan`) in the empty state, shows the selected route's steps in the left detail face straight away; you can still swap between the people list and route detail with the swap button. There is no saved-people count line. The right sidebar keeps its parameters panel sticky while fair-area results scroll directly beneath it.

## Repository layout

- `src/` — application source. `src/index.html` is the entry page; `src/js/` holds focused modules (`config`, `store`, `util`, `i18n`, `data`, `vectors`, `routing`, `search`, `state`, `map`, `ui`, `engine`); `src/styles.css` and `src/legal.css` are the stylesheets.
- `static/` — files served exactly as written: `data/` (generated transit graph and POI index), `i18n/` (all 15 locale catalogs), `sw.js`, SEO files, and icons. Raw feeds stay in `static/data/raw/` and are never committed or deployed.
- `scripts/` — the data pipeline (`build_graph.py`, `build_poi_index.py`) and the post-build step (`finalize.mjs`) that writes `_headers`, copies the service worker verbatim, prunes non-deploy data, and writes `.gz` siblings.
- `tests/` — Playwright specs that always run against the built `public/` artifact.

## Dependencies

Libraries come from npm and are bundled by Vite: `leaflet`, `maplibre-gl`, `@maplibre/maplibre-gl-leaflet`, and `lucide-static` (icons are inlined into the stylesheet as data URIs). There are no vendored copies in the repository.

The routing engine in `src/js/routing.js` stays hand-written on purpose. No widely adopted small library covers fair-area computation over a custom multi-modal HK graph, and a heavier routing stack would not fit a no-backend static site.

## Run locally

```sh
npm install
npm run dev
```

Or build and serve the production artifact:

```sh
npm run build
npm run serve
```

## Tests and lint

```sh
npm test
npm run lint
```

Playwright builds `public/` first and serves that directory at `http://127.0.0.1:8765`, so the tests exercise the same artifact that is deployed. Set `TEST_BASE_URL` to run the smoke spec against a deployed site instead, for example `TEST_BASE_URL=https://zg852.pages.dev npm test`.

## CI/CD

`.github/workflows/ci.yml` runs lint, build, and the full Playwright suite on every push to `main` and every pull request. Every green push to `main` is then published to Cloudflare Pages with `wrangler pages deploy`. The deploy job needs two repository secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

`npm install` runs the `prepare` script, which sets `core.hooksPath=.githooks`. That activates the repository hooks in `.githooks/`. The pre-commit hook enforces that `observations.md` is prepend-only: every assistant turn adds a new block at the top, and existing lines must never be edited or removed.

## Build and manual deploy

```sh
npm run build
npm run pages:deploy
```

Vite bundles and minifies `src/` into `public/` and copies `static/` alongside it. `scripts/finalize.mjs` then writes the `_headers` security and caching rules, copies `static/sw.js` verbatim to the deploy root, prunes non-deploy data files, and writes `.gz` siblings for compressible assets. There is no post-build patch step: `static/sw.js` is the deployed worker. When you change a cached asset, bump the cache version in `static/sw.js` and add any new bundle file to its precache list.

## Data and services

- Transit routing uses a local graph generated from a community-maintained Hong Kong GTFS feed by `scripts/build_graph.py`. The raw feed is excluded from the repository and from `public/`.
- The interest index is generated by `scripts/build_poi_index.py` from open Hong Kong government data and Overture. The raw feed is excluded from the repository and from `public/`.
- Place search uses the keyless Photon API from komoot.
- The basemap uses keyless OpenFreeMap vector tiles built from OpenStreetMap data.
- People (including per-person walk tolerance), settings (including the `includeHeadway` parameter), saved profiles, locale, and a small geocoder cache stay in browser `localStorage`.

## Inspiration

Inspired by [FairPin PH](https://fairpin.ph/). I have not used their service. This project is independent and is not affiliated with or endorsed by FairPin PH.

## Legal

See `PRIVACY.md`, `TERMS.md`, `CREDITS.md`, and `THIRD_PARTY_NOTICES.md`. Published legal pages are built from `src/privacy.html`, `src/terms.html`, and `src/credits.html`.

## License

MIT, see `LICENSE`. Third-party components keep their own licences, see `THIRD_PARTY_NOTICES.md`.
