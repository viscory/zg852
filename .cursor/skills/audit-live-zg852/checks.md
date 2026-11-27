# Live checks

Base URL: `https://zg852.pages.dev/`. Repeat a failing check after a hard reload before you file it.

## A. First load

Request `/`, `/privacy`, `/terms`, `/credits`, `/sw.js`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/favicon.ico`, `/favicon.svg`, `/og-image.png`, `/app.js`, `/app.css`, `/preview-noindex.js`, `/maplibre-gl-worker.mjs`, and every `/data/*.json` and `/i18n/*.json` the worker lists. Record status, content type, and cache-control.

Also request `/definitely-not-a-page` and `/data/graph.json`. Status 200 with the home page body is a soft 404. `/privacy.html` may 308 to `/privacy`. Canonical and sitemap URLs must be the final URL.

On `/` and `/app.js`, record `content-security-policy`, `x-content-type-options`, `x-frame-options`, `referrer-policy`, and `permissions-policy`.

## B. Journey

Desktop 1280×800. Wait until routing is ready (`#netstatus` is not `loading`, or `html[data-net=ready]`).

1. Both chips on. Search Central station and Sha Tin station. Results appear without a second click after the second pick (`scheduleRecompute`).
2. Change one start to Kowloon Tong. The list changes with no Search click.
3. Recenter (`.map-recenter-control`) shares the x of `.leaflet-control-zoom` and sits under it, not in the right sidebar.
4. Both starts Central. The detail is the already-there sentence, not an empty-leg sentence, when the time is 0.
5. Three people. A pin far from stops shows the no-nearby error and does not freeze the page. The travel budget slider is absent.

## C. Route truth

Run the graph script, then these live pairs twice. Compare the step text with the script and with a published operator time.

| Pair | Mode | What to judge |
| --- | --- | --- |
| Central, Sha Tin | both, then MTR only | An MTR leg exists. The meeting name may be a bus stop. |
| Central, Kowloon Tong | MTR only | TWL and KTL. Ride times are ordinary urban hops, not tens of minutes for one stop. |
| Tsim Sha Tsui, Airport | both | Airport Express Airport to Tsing Yi. Flag a ride near 30 minutes or a fare from the shared rail band (top HK$20.5). |
| Kennedy Town, Shau Kei Wan | both | Island line both ways. No walk across the harbour. |
| Nam Cheong, Tuen Mun | MTR only, tolerance 10% | Empty is a defect if stations are reachable inside the fixed 90-minute cap. |
| Swap the two starts | both | Same areas. Fares follow the person. |

Also count, in the top result, `.ride-leg.route-rail` and `.ride-leg.route-bus`. A bus-only title with MTR steps is a labeling issue, not a missing MTR leg.

## D. Place search

Type five characters 120 ms apart. Expect one Photon request, not one per key.

`zzzzqqqq` shows a visible no-match row. Abort `photon.komoot.io` and expect the unavailable message plus any local stops. `中環` returns places. A `<script>` query does not inject a script.

## E. Map

Pan to Lantau, Lamma, and the northern border. Note blank tiles. Zoom and recenter work at 1280, 768, and 360. No horizontal scroll (`scrollWidth - clientWidth`).

## F. Locales

Locales: en, zh-Hant, zh-Hans, ja, ko, hi, ur, fil, id, fr, th, vi, ne, es, de.

Fetch each `/i18n/*.json`. Same key set as `en`. After each switch, these must not stay English unless the catalog value is intentionally the same word: attribution, credit line, tolerance ends, zoom-in name, map issue link. `html[dir=rtl]` for `ur`. At 1280px the people panel (`.side-left`) is on the right. Reload keeps `hkfair.v2.locale`.

Spot-check 10 `zh-Hant` strings against `zh-Hans` for the wrong script.

## G. Worker

Record the `CACHE` string in live `/sw.js`. After the worker activates, list cache keys. Set the browser offline and reload `/`. Record whether the shell appears. On an already open page, offline local search for Central still lists the station. `/data/` that is cache-first will keep old bytes until the cache name changes. Say which strategy the live worker uses.

## H. Size and time

Cold context, cache disabled, service worker blocked. Fast 3G is 1.6 Mbps down, 750 Kbps up, 150 ms latency, CPU 4×. Twice: time to `h1`, time to map canvas plus ready status, transferred bytes. Name the largest file and when it starts (load versus first search). `poi-index.json` waits for the interest toggle.

## I. Access

Tab to a start field, type Central, ArrowDown, Enter. Buttons have accessible names. Contrast of `--subtle` text on white. If it is under 4.5:1 at under 18px, file it. No screen reader means NOT TESTABLE for announcements. `#detail` is `aria-live=polite`. The results list is not.

## J. Phone

390×844 and 360×640. Targets under 44px: library, locale select, card icon buttons, focus options, zoom, recenter, directory buttons. State whether the start field sits in the bottom 300px, where a keyboard would cover it. A real keyboard is NOT TESTABLE unless a device is attached.

## K. Bots

`robots.txt`, `sitemap.xml`, `llms.txt`, icons, `og-image.png` return 200. Homepage has title, description, canonical, Open Graph, and Twitter. Legal pages have the same or a recorded gap. `preview-noindex.js` adds `noindex` only when the host is not `zg852.pages.dev`. Legal pages must include that script.

## L. Trust

Privacy, Terms, and Credits dialogs match `src/privacy.html`, `src/terms.html`, and `src/credits.html`. List `localStorage` keys after a search. Expected prefix `hkfair.v2.`. List third-party hosts. Photon and `tiles.openfreemap.org` tiles and `/fonts/` glyphs must be named in the privacy page. `THIRD_PARTY_NOTICES.md` names Leaflet, MapLibre GL JS, maplibre-gl-leaflet, Lucide, OpenStreetMap, OpenFreeMap, Photon, and the GTFS feed.

## Graph script

`python .cursor/skills/audit-live-zg852/scripts/graph_sanity.py`

The script now counts every printed `ISSUE` line (including missing files, missing station nodes, and mispositioned nodes), prints `ISSUE_COUNT`, and exits non-zero when any issue exists. Treat a non-zero exit as a failed gate: it must be green in CI before an audit is considered clean. Record each `ISSUE` line in the report. A clean script still does not prove the live UI, so pair it with section C.
