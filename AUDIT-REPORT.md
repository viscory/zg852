# Audit report: https://zg852.pages.dev/

> ## Historical snapshot — superseded
>
> This is a dated record of the live site as checked on **23 November 2026**, kept for history only. Every number in the body below is from that date and is not a current pass/fail result. For present-day facts, read `static/sw.js`, `static/i18n/en.json`, `src/js/`, and the Playwright suite in `tests/` — not this report, and not the subjective critique in `DESIGN.md`.

## Current status

- Service-worker cache: `zg852-v80` (`static/sw.js:1`).
- English catalogue: 197 keys (`static/i18n/en.json`).
- Current implementation lives in `src/js/`; current behaviour is verified by the Playwright suite in `tests/`.
- Everything below this section is the historical snapshot taken on **23 November 2026**.

Question: does the live 就腳 site pass the live checks on 23 November 2026?

Date: 23 November 2026, 03:09–03:33 UTC.

The live origin was the subject. The git tree was read to learn intent. Nothing was deployed. `TEST_BASE_URL=https://zg852.pages.dev npm test` passed 50 tests in 17.1s.

## Area results

| Area | Result | Why |
| --- | --- | --- |
| A. First load | PASS | Listed assets return 200. Unknown paths return 404. Security headers are present on `/` and `/app.js`. |
| B. Journey | ISSUES | Search, recenter, identical starts, budgets, and a far pin work. A late place list opens again and covers the next field. |
| C. Route truth | ISSUES | The checked pairs return MTR legs and ordinary times. One top title is a bus stop while the steps are MTR. |
| D. Place search | ISSUES | One Photon request, the no-match row, the abort message, and script text behave. `中環` shows nothing. |
| E. Map | PASS | Lantau, the south coast, and the northern border draw tiles and labels. Zoom and recenter work. No horizontal scroll. |
| F. Locales | PASS | All 15 catalogs have the English key set. Checked strings change. Urdu puts the people panel on the right. |
| G. Worker | PASS | Cache `zg852-v24` is network-first. An offline reload shows the shell and becomes ready. |
| H. Size and time | PASS | Cold Fast 3G reaches the heading in about 0.4s and ready in 11.6s. The limit is `network.json`. |
| I. Access | PASS | Keyboard search works. Jyutping contrast is 7.06:1 at 13px. Announcements were not tested. |
| J. Phone | ISSUES | Measured targets are at least 44px. The start field sits in the bottom 300px. No real keyboard was attached. |
| K. Bots | ISSUES | Robot files and the home page tags are present. Legal pages omit Open Graph and Twitter tags. |
| L. Trust | PASS | Legal text matches the source pages. Storage keys use `hkfair.v2.`. Privacy names the hosts the browser calls. |

## Issues

### 1. Without WebGL2, search fails and the map error stays hidden

Severity: high. Confidence: high.

Expected: a map failure shows the map message, and place search still returns areas.

Actual: the status becomes `ready`, two person cards render, and the canvas count stays 0. The visible error stays empty until a search. The search then shows `The search failed: Cannot read properties of undefined (reading 'clearLayers')` and returns no rows.

Evidence: Chromium launched with `--disable-webgl --disable-webgl2 --disable-gpu` against `https://zg852.pages.dev/`. The console contains `GPUInitializationError: WebGL2 is required to display this map.` The same state occurred on the second launch. Central plus Sha Tin produced the `clearLayers` error both times.

Repro: open the live site with WebGL2 disabled. Wait until `html[data-net=ready]`. Choose Central and Sha Tin.

Change: catch the map failure that arrives after `createMap()` returns. Show the map-failed text. Do not call `clearLayers` on a layer that was not created.

### 2. A chosen place list opens again and covers the next field

Severity: high. Confidence: high.

Expected: after a station is chosen, the suggestion list stays closed.

Actual: the field value is the station, then the list opens again with Photon rows. The open list covers the next start field. A click there selects a place instead of focusing the next field.

Evidence: after choosing Central, the list showed `Central`, `Central · Exit B`, `Central and Western District, Hong Kong, China`, and `Central Plaza, 18 港灣道 Harbour Road, Hong Kong, China`. After choosing Sha Tin, the list showed `Sha Tin`, `Sha Tin Wai`, `Sha Tin, Hong Kong, China`, and `Sha Tin District, Hong Kong, China`. The same reopen happened on a later pass after a reload, for every pair in that pass.

Repro: on `https://zg852.pages.dev/`, type Central, choose the station row, and wait for Photon. Repeat with Sha Tin after a reload.

Change: when a place is chosen, ignore the Photon response that is still in flight.

### 3. A two-character Chinese query shows no places and no message

Severity: medium. Confidence: high.

Expected: `中環` returns places.

Actual: the suggestion list stays hidden. There is no no-match row and no unavailable row.

Evidence: pass 1 and pass 2 both recorded `{hidden: true, error: "", labels: []}` for `中環`. The same pages then accepted `尖沙咀` and showed `Tsim Sha Tsui, Hong Kong, China` plus five more rows.

Repro: focus a start field, enter `中環`, and wait 1.5s. Repeat on a new page.

Change: request remote places for a two-character query, or show the no-match row when the local list is empty.

### 4. The top meeting title can be a bus stop while every step is MTR

Severity: low. Confidence: high.

Expected: the title matches the mode the steps use, or the title is clearly only the cell label.

Actual: the title is `Ho Man Tin Street, Waterloo Road` and the row text includes `bus stop`. The steps are `MTR TWL: Central to Mong Kok, 5 stops, 10.7 min` and `MTR EAL: Sha Tin to Mong Kok East, 3 stops, 10 min`. Rail count is 2. Bus count is 0.

Evidence: Central plus Sha Tin, both modes, pass 1 and pass 2. The same title and the same step text returned both times. MTR-only mode returned the same title and the same MTR steps.

Repro: set both people to Central and Sha Tin. Read the first result title and the step text.

Change: when the shown legs are rail, use a station label for that result.

### 5. The start field sits in the bottom 300px on a phone viewport

Severity: medium. Confidence: high for the position. A real on-screen keyboard was not attached, so coverage by a keyboard was not observed.

Expected: the start field stays out of the bottom 300px, where a keyboard would cover it.

Actual: at 390×844 the field top is 734px and the bottom is 778px. At 360×640 the field top is 636px and the bottom is 680px. Both tops are inside the bottom 300px.

Evidence: both viewports, after the page was ready. Horizontal scroll gap was 0. Measured targets were at least 44×44 px. The library, locale, card icons, focus options, zoom, recenter, and directory buttons were included.

Repro: open the live site at 390×844 and at 360×640. Read the start field rectangle.

Change: keep the start field above the bottom 300px, or scroll it into view when it receives focus.

### 6. Legal pages omit the social tags used on the home page

Severity: low. Confidence: high.

Expected: legal pages include the same title, description, canonical, Open Graph, and Twitter tags as the home page, or the gap is recorded.

Actual: `/privacy`, `/terms`, and `/credits` have a title, a description, a canonical URL, and `preview-noindex.js`. They do not contain `og:title` or `twitter:card`. The home page has both.

Evidence: the live HTML for `/`, `/privacy`, `/terms`, and `/credits` was fetched twice. Sitemap locations are `https://zg852.pages.dev/privacy`, `/terms`, and `/credits`. `/privacy.html` returns 308 to `/privacy`. The same redirect exists for terms and credits.

Repro: `curl -s https://zg852.pages.dev/privacy` and search for `og:title`. Repeat for `/terms` and `/credits`.

Change: add the home page Open Graph and Twitter tags to the three legal pages.

## Checks that passed

A. `sw.js` cache name is `zg852-v24`. It lists 32 asset paths and does not list itself. `/`, `/app.js`, `/app.css`, `/preview-noindex.js`, icons, `og-image.png`, `maplibre-gl-worker.mjs`, the four data files, and 15 locale files return 200. `/robots.txt`, `/sitemap.xml`, and `/llms.txt` return 200. `/definitely-not-a-page` and `/data/graph.json` return 404 with a not-found page. A second header read returned 404 again. `/` and `/app.js` send `nosniff`, `DENY`, `strict-origin-when-cross-origin`, `geolocation=(), camera=(), microphone=()`, and a content security policy that allows Photon and `tiles.openfreemap.org` on `connect-src`.

B. Central then Sha Tin produced rows with no Search click. `go` click count stayed 0. Changing the first start to Kowloon Tong changed the title from `Ho Man Tin Street, Waterloo Road` to `Tai Wai` with no Search click. The recenter control x is 882, the same x as zoom. Its top is 725. The zoom bottom is 715. It does not overlap the right sidebar. Two Central starts show `Central Already there`. Budget 15 shows `No areas fit this tolerance and budget. Increase either setting.` Budget 180 returns rows. A pin at `Pin 24.2, 112.6` shows `A start place has no nearby transit stop within the travel budget.` The Search button stays enabled. A second far pin, `Pin 22.8, 113.8`, shows the same error.

C. The graph script printed `lines_by_c {3: 20, 0: 26, 1: 2822, 2: 31}` and `ISSUE_COUNT 0`. The live `network.json` and `nodes.json` hashes match `static/data`. Airport to Tsing Yi in the graph is 13.63 min. The line wait is 6.0 min. The live step says `MTR AEL: Airport to Tsing Yi, 1 stop, 19.6 min`. That is the edge plus the wait, not a ride near 30 min. The Airport person fare is `HK$70`. The Tsim Sha Tsui person fare is `HK$16.1`. Neither fare is the shared rail top of HK$20.5. The MTR page says the 35.3 km Airport to city trip takes as little as 24 minutes. Central to Kowloon Tong uses `MTR TWL` for 9.9 min over 4 stops and `MTR KTL` for 9.2 min over 4 stops. Kennedy Town to Shau Kei Wan uses `MTR ISL` both ways, 15.8 min and 15.4 min, with walks of 1.5 to 2.5 min. Nam Cheong to Tuen Mun, MTR only, 90 min, 10% tolerance, returns `Kam Sheung Road` on `MTR TML` in 20.9 min and 20.5 min. Swapping Central and Sha Tin keeps `Ho Man Tin Street, Waterloo Road`. The East Rail leg moves from person B to person A. Both fares are HK$8.2. Every pair above was run twice.

D. Typing `qwxyz` sent one Photon request. `zzzzqqqq` shows `No places match. Pick a transit stop or use a map pin.` Aborting Photon during `Central` shows `Place search is unavailable. Pick a transit stop or use a map pin.` and the rows `Central` and `Central · Exit B`. The query `<script>window.__xss=1</script>` does not set that flag. The list shows the no-match text.

E. A west pan shows Tung Chung, Mui Wo, and Tai O with labels. A north pan shows Lau Fau Shan and the Shenzhen side with labels. A south pan shows Stanley and the water south of Hong Kong Island. No blank tile field was seen. Zoom in changes the map proxy scale from 2048 to 4096 at 1280px. Recenter restores the camera after a 220px pan at 1280px and at 360px. Zoom also changes the camera at 768px. Scroll gap is 0 at 1280, 768, and 360.

F. Each catalog has 148 keys, the same set as English. Ten Traditional and Simplified strings differ and do not use the other script. After Urdu, `dir` is `rtl` and `.side-left` starts at x=920 on a 1280px page. Reload keeps `hkfair.v2.locale` as `de` and `html lang` as `de`.

G. The worker fetches the network first and uses the cache when that fetch fails. `/` is not a cache key. `index.html` is. After the worker controls the page, DevTools offline mode reloads `/` with status 200. Five seconds later the heading is present, `data-net` is `ready`, and two cards exist. The same result occurred on the second offline reload. Offline search for Central lists `Central` and `Central · Exit B`.

H. Claim tested: cold Fast 3G time until the map canvas exists and `data-net` is `ready`. Two runs, service worker blocked, cache disabled, 1.6 Mbps down, 750 Kbps up, 150 ms latency, CPU 4×. Load average moved from 1.26 to 2.11 on 12 cores. Run 1 heading 388 ms, ready 11619 ms. Run 2 heading 348 ms, ready 11581 ms. The ready spread is 38 ms. Failed responses: 0. `network.json` is the largest transfer, 588981 bytes, and it lasts 6937 ms. Ready is about 200 ms after that transfer ends. Total transfer is 1295778 bytes. `poi-index.json` is absent before the interest toggle and present after it. The number is the graph download on the throttled link, not a cached or failed load.

I. Tab reached a start field in 7 tabs. Typing Central, ArrowDown, and Enter sets the value to Central. No button lacked an accessible name. `h1 .jyutping` is `rgb(107, 83, 78)` on white, 13px, contrast 7.06:1. `#detail` is `aria-live=polite`. `#resultsList` has no `aria-live`. No screen reader was available.

J. At 390×844 and 360×640, the smallest measured target is 44×44 px. Scroll gap is 0.

K. The home page has a title, description, canonical `https://zg852.pages.dev/`, Open Graph, and Twitter tags. `preview-noindex.js` adds `noindex` only when the host is not `zg852.pages.dev`. The live home page has no robots noindex meta. Legal pages include that script.

L. Live privacy, terms, and credits text matches the source pages except the built stylesheet URL. The privacy page says the map requests font files from `tiles.openfreemap.org`. The browser requested `https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf` and received 200. Hosts seen: `zg852.pages.dev`, `photon.komoot.io`, and `tiles.openfreemap.org`. Storage keys after a search: `hkfair.v2.people`, `hkfair.v2.locale`, `hkfair.v2.directory`, `hkfair.v2.geocache`, and `hkfair.v2.settings`. The live third-party notice names Leaflet, MapLibre GL JS, maplibre-gl-leaflet, Lucide, OpenStreetMap, OpenFreeMap, Photon, and the GTFS feed.
