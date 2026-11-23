# Audit report: https://zg852.pages.dev/

Date: 23 November 2026, 01:46–02:13 UTC.

Auditor role: independent. The live site was the subject. The git tree was read only, to learn intent.

Production at the end of the audit still served service worker `zg852-v21`. A later note in `observations.md` describes source edits and cache `zg852-v23`. Those edits were not on the live origin at 02:13 UTC. This report describes the live site.

## Method

- HTTP checks with `curl` against `https://zg852.pages.dev/`. Repeated for the failing URLs.
- `TEST_BASE_URL=https://zg852.pages.dev npm test` from the repo root. Result: 41 passed, 2 failed, 13.2s.
- Chromium via Playwright against the live origin. Desktop 1280×800, phone 390×844 and 360×640.
- Each defect below was seen at least twice, unless the row says otherwise.
- Lighthouse 12.8.2 against the live URL, using the Playwright Chrome binary. That run has a limit. See area H.
- No screen reader was available.
- No real phone was available. Phone results are viewport emulation.

Severity and confidence are separate. High severity means a user can lose the task or get a wrong travel fact. High confidence means the evidence was repeated and the cause is identified.

## Area results

| Area | Result | Why |
| --- | --- | --- |
| A. Availability and first load | ISSUES | Real pages return 200 and the security headers are present. Unknown paths return the home page with status 200. |
| B. Core journey | ISSUES | The normal desktop journey works. A missing WebGL2 aborts startup with no message. Identical starts produce an empty route. |
| C. Routing sanity | ISSUES | Four ordinary pairs look sane, and fairness is symmetric. Airport Express time and fare do not match the published service. |
| D. Place search | ISSUES | English, Chinese, debounce, and a blocked Photon call behave. A query with no hits is silent. |
| E. Map and UI controls | PASS | Tiles, labels, zoom, and recenter work across Hong Kong, the islands, and the border. Recenter sits on the map under the zoom control. |
| F. Internationalisation | ISSUES | All 15 catalogs load and most UI strings change. Several English strings remain. Urdu sets `dir=rtl`, and the two sidebars stay in the left-to-right places. |
| G. PWA and offline | ISSUES | The worker registers and precaches 30 files. A reload while offline fails. |
| H. Performance | ISSUES | Cold Fast 3G map-ready time is about 11.2s. The long piece is `network.json`. Feedback is the word "loading" only. |
| I. Accessibility | ISSUES | Keyboard search works and controls have names. Jyutping contrast is 3.54:1. No screen-reader pass. |
| J. Mobile | ISSUES | No horizontal scroll, and the map is usable at 390×844. Several targets are under 44px. A real on-screen keyboard was not tested. |
| K. SEO and bots | ISSUES | Homepage meta tags are complete and Lighthouse SEO is 100. Sitemap and canonical URLs redirect. Legal pages omit social tags and the preview script. |
| L. Legal and trust | ISSUES | Privacy, Terms, and Credits render and match the HTML sources. The deployed privacy markdown denies a font request the browser makes. |

## Issues

### 1. Unknown URLs return the home page with status 200

- Severity: high. Confidence: high.
- Expected: a missing path returns 404. `/_headers` is a Cloudflare config file and is not a public document.
- Actual: these URLs return `200`, `text/html`, 15764 bytes, etag `"3244500089040a2c60c93ebe5e60b897"`. That etag is the home page etag.

| URL | Status | Body |
| --- | --- | --- |
| `/definitely-not-a-page-xyz` | 200 | home page HTML |
| `/_headers` | 200 | home page HTML |
| `/_redirects` | 200 | home page HTML |
| `/data/graph.json` | 200 | home page HTML, not JSON |

The home page itself uses `Cache-Control: no-cache`. The unknown paths use `Cache-Control: public, max-age=0, must-revalidate`. The repo has no `_redirects` file. The fallback is outside the repo, in the Pages project.

Harm: crawlers can index junk URLs. A client that checks `response.ok` will parse HTML as JSON. Two production tests fail for this reason:

- `tests/e2e.spec.js` “robots, llms, sitemap and build headers expose the llms.txt endpoint”
- `tests/e2e.spec.js` “production bundle avoids importmaps and CSP exceptions”

Both tests fetch `/_headers` and expect the header source. The live security headers are present on real files. See area A. The tests fail because the URL is the home page, so the body does not contain the header text.

Repro: `curl -sI https://zg852.pages.dev/definitely-not-a-page-xyz` and the same for `/_headers`. Repeated in two curl sessions and in the Playwright run.

Change: turn off the Pages “serve index.html for unknown paths” behaviour. Unknown paths should be 404. Keep the header rules on real files.

### 2. Without WebGL2 the app stays on “loading” and draws no people

- Severity: high. Confidence: high.
- Expected: a map failure shows a message, and place search and routing still start.
- Actual: status stays `loading`, person cards stay at 0, and the map canvas stays at 0. The only error is in the console:

`GPUInitializationError: WebGL2 is required to display this map.`

`createMap()` runs first inside `init()` and has no catch. When it throws, `loadNodes()`, `loadNetwork()`, and `renderCards()` do not run. The static HTML has an empty card list.

Repro, twice:

1. Lighthouse headless logged the same console error and never requested `network.json`.
2. Playwright Chrome with `--disable-webgl --disable-webgl2 --disable-gpu`. After 5 seconds: `{net: "loading", cards: 0, canvas: 0}`.

A normal headless Playwright session does have WebGL2. The desktop screenshots show a real map. This defect hits browsers and locked-down machines where WebGL2 is off.

Change: catch the map error, write it into `#error`, and continue `init()`.

### 3. An offline reload cannot start the app

- Severity: high. Confidence: high.
- Expected: after one online visit, a reload while offline shows the shell, saved people, and local stop search. Map tiles may fail.
- Actual: reload fails with `net::ERR_INTERNET_DISCONNECTED`. The document never arrives, so the cached bundle never runs.

The live worker is `zg852-v21` and it does activate. The cache holds 30 URLs, including `/app.js`, `/data/network.json`, and the 15 catalogs. It does not hold `/` or `/index.html`. The fetch handler returns immediately for `/`, `/index.html`, and `/sw.js`, so those requests are network only.

What still works, checked on an already open page after `setOffline(true)`:

- `fetch('app.js')` returns 200 from the cache.
- Typing `Central` still lists the local station, plus the text “Place search is unavailable. Pick a transit stop or use a map pin.”

Repro: load `/`, wait until the worker controller exists and the status leaves `loading`, set the browser offline, reload. Done twice. Both reloads failed the same way.

Change: keep a cached copy of the shell and use network-first for `/`, with the cache as the fallback. The current skip makes the precache unreachable offline.

### 4. Airport Express time and fare are far from the published service

- Severity: high. Confidence: high.
- Pair: Tsim Sha Tsui station and Airport station. Budget 60 minutes. Both modes on.
- Result, twice, same text: meeting area Tsing Yi. Person from the Airport: “MTR AEL: Airport to Tsing Yi, 1 stop, 30.5 min” and “Fare HK$13.2”. Total for that person 33.9 min.

Published comparison: the MTR Airport Express page says the journey between the Airport and the city “takes as little as 24 minutes” (`https://www.mtr.com.hk/en/customer/services/airport_express_index.html`, fetched 23 November 2026). That published trip includes Tsing Yi, Kowloon, and Hong Kong. The app’s one-stop Airport to Tsing Yi leg is 30.5 minutes, which is longer than the published full trip.

The fare comes from one distance table for every rail line. The last band in the app config is `Infinity → 20.5`. The shown AEL fare is HK$13.2. The page does say the fare is an estimate. HK$13.2 is still the wrong kind of number for the Airport Express, which uses its own premium fare.

Other pairs from the same session were sane. See the routing table in the checks section. Swapping Central and Sha Tin kept the same areas, and the fares swapped with the people.

Change: inspect the AEL edge minutes in the graph. Give the Airport Express its own fare table, or suppress the dollar figure on that line.

### 5. A place query with no hits fails silently

- Severity: medium. Confidence: high.
- Input: `zzzzqqqq` in the first start field. Wait 1.5 seconds.
- Expected: a visible “no places” message.
- Actual, twice: the suggestion list is hidden, its text is empty, and `#error` stays hidden.

A blocked Photon call is different and does talk to the user. With `photon.komoot.io` aborted, the list shows “Place search is unavailable. Pick a transit stop or use a map pin.” plus any local stops. `Aberdeen` showed that message and three local stops.

`<script>alert(1)</script>` added no DOM script. `中環'` returned Photon places. Debounce: typing `centr` as five characters, 120 ms apart, caused one Photon request.

Change: when the remote list and the local list are both empty, show a no-match row. The code already has a path for the failure flag. The empty-success path hides the list (`hidden = !items.length && !failed`).

### 6. English remains on screen in every locale

- Severity: medium. Confidence: high.
- All 15 catalogs return 200 and valid JSON, 138 keys each. No catalog is missing a key that `en` has. `zh-Hant` and `zh-Hans` differ on 115 keys, and a sample of 10 visible strings in each was the right script.
- Switching the locale control updates the subtitle, buttons, fare note, and legend. Reload keeps the choice. After the last switch to `de`, reload showed `lang=de`, `dir=ltr`, and `localStorage['hkfair.v2.locale']==='de'`.

These strings stayed English in all 15 locales, including `zh-Hant`, `ja`, and `ur`:

| Surface | Live text | Cause |
| --- | --- | --- |
| Footer paragraph | “Routing runs in this browser…” | `note.attribution` is the English sentence in every catalog |
| Credit line | “Inspired by FairPin PH. I have not used their service.” | Hard-coded in `index.html`, no `data-i18n` |
| Budget ends | “15 min” and “180 min” | Hard-coded in `index.html` |
| Zoom in button | aria-label “Zoom in” | Leaflet default, not passed through `t()` |
| Map place labels | English names such as Sha Tin and Mong Kok | Style uses `['get','name:en']` |
| Map credit | “Report a map issue” | Hard-coded in the map setup. Still English on the Urdu screenshot |

`results.noRoutes` is also the English sentence in every catalog: “No route legs are available for this place.”

No raw keys such as `people.title` were visible.

Change: translate `note.attribution` and `results.noRoutes` in the 14 catalogs. Move the credit line and the two budget ends into the catalogs. Set the Leaflet zoom labels from `t()`. Pick `name:` plus the active language in the map style, with `name:en` as the fallback.

### 7. Urdu sets RTL, and the sidebars stay in the left-to-right places

- Severity: medium. Confidence: high.
- `ur` sets `documentElement.dir` to `rtl` and `body` class `rtl`. Input text aligns to the right. The brand block moves to the right (x=945 at 1280px).
- The people panel (`.side-left`) stays at x=0, width 360. The options panel (`.side-right`) stays at x=940, width 340. Those are the same places as English.
- The live CSS does contain `html[dir=rtl] .side-left{grid-column:3}` and a flipped template `340px … 360px`. With RTL grid line order, those rules put the 360px people panel back on the left. The header flex row does flip. The columns do not.

Change: measure the two panels in `ur` after any column edit. The people panel should sit on the right.

### 8. Subtle text contrast is 3.54:1

- Severity: medium. Confidence: high.
- Lighthouse, on `.jyutping`: “insufficient color contrast of 3.54”.
- Computed style: color `rgb(154, 131, 126)`, which is `--subtle` `#9a837e`, on white. Ratio 3.55:1. The live rule does not set a font size, so the Jyutping inherits the 20px heading size.
- The same token is used by `.hint` at 12px in the live CSS. 12px text needs 4.5:1. 3.55:1 fails that bar.
- Sampled UI text that uses `--text`, `--muted`, or white-on-accent passes: muted on white 6.32:1, text on white 17.37:1, white on the red button 5.88:1.

Change: darken `--subtle` until 12px text on white reaches 4.5:1.

### 9. Touch targets are under 44px

- Severity: medium. Confidence: high.
- Measured with `getBoundingClientRect` at 1280×800 and at 360×640.

| Control | Size |
| --- | --- |
| Saved-people button `#library` | 28×28 |
| Language `<select id="locale">` | 101×22 |
| Save, remove, pin, move buttons | 39×39 |
| Time / Cost options | height 30 |
| Leaflet zoom buttons | 30×30 inside a 34px control |
| Recenter button | 30×30 at 360px wide, 34×34 box at desktop |
| Directory row buttons | 28×28 in the stylesheet |

The recenter control is on the map, directly under the zoom control (same x, gap under 12px). It is not in the sidebar. That part passes.

Change: use at least 44×44 for these controls at coarse pointer sizes. The language control needs a taller hit area.

### 10. Privacy markdown says the app requests no font files

- Severity: medium. Confidence: high.
- `https://zg852.pages.dev/PRIVACY.md` says: “Font glyph or sprite files are not requested. Icons are bundled locally.”
- Cold loads, twice, requested `https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf`. The map style sets `glyphs` to `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf`.
- The in-app Privacy dialog loads `privacy.html`, which does not contain that false sentence. It says the app requests vector tiles from OpenFreeMap and that icons are local. It does not name the font files. The markdown file is also public.
- Observed `localStorage` keys after use: `hkfair.v2.people`, `hkfair.v2.settings`, `hkfair.v2.directory`, `hkfair.v2.geocache`, `hkfair.v2.locale`. The privacy text covers those. The code also reads `hkfair.v1.locations` and `hkfair.v1.modes` when they exist. A fresh profile did not write them.
- Observed third-party hosts: `photon.komoot.io` and `tiles.openfreemap.org`. No analytics host appeared.
- `THIRD_PARTY_NOTICES.md` names Leaflet, MapLibre GL JS, maplibre-gl-leaflet, Lucide, OpenStreetMap, OpenFreeMap, Photon, and the GTFS feed. Those match the bundle. Icons in the passing production test are inline `data:` SVG masks.

Change: delete the “font glyph or sprite files are not requested” sentence from `PRIVACY.md`. Say the map requests font glyph files from `tiles.openfreemap.org`. Add the same sentence to `privacy.html`.

### 11. Two identical starts show “No route legs” for a 0 minute meeting

- Severity: low. Confidence: high.
- Input: both people set to the Central station. Run search. Done twice.
- Actual: first row title “Central”, “Spread 0 min. Longest 0 min.”, detail text “Central No route legs are available for this place.”
- The 0 minute legs are dropped because a leg must be longer than 0.05 minutes. The empty list then uses `results.noRoutes`.

Change: when the meeting node is the start, show the already-there sentence instead of the empty-leg sentence.

### 12. Legal URLs in the sitemap and canonical links redirect

- Severity: low. Confidence: high.
- `https://zg852.pages.dev/privacy.html` returns 308 to `https://zg852.pages.dev/privacy`. The same is true for `terms.html` and `credits.html`. The extensionless URLs return 200.
- `sitemap.xml` and each page’s `<link rel="canonical">` use the `.html` URL.
- Homepage title, description, canonical, Open Graph, and Twitter tags are present and point at `https://zg852.pages.dev/`.
- Legal pages have a title and a description. They have no Open Graph tags and no Twitter tags.
- `preview-noindex.js` adds `noindex, nofollow` only when the host is not `zg852.pages.dev`. The homepage includes that script, so production stays indexable. `privacy.html`, `terms.html`, and `credits.html` do not include the script. A preview host would leave those three pages indexable.
- `robots.txt`, `sitemap.xml`, `llms.txt`, `favicon.ico`, `favicon.svg`, and `og-image.png` return 200. The sitemap locations resolve, through the 308 on the three legal URLs.

Change: point the sitemap and the canonical links at `/privacy`, `/terms`, and `/credits`. Add `preview-noindex.js` to the three legal pages.

### 13. Transit data stays cached until the cache name changes

- Severity: medium. Confidence: high on the mechanism. This was not observed across two deploys.
- Live `sw.js`: cache name `zg852-v21`. `/data/` uses cache-first. A cache hit returns the old bytes and does not revalidate. HTTP `max-age=3600` on those files does not apply inside the Cache API.
- `install` calls `skipWaiting`. `activate` deletes every cache whose name is not the current one, then `clients.claim()`.
- HTML, `/sw.js`, and the worker script URL are not intercepted, so a new document can arrive while an old worker is still in control for a short time. After the new worker activates, old caches are deleted.
- If a deploy changes `network.json` and does not change the cache string, returning browsers keep the old graph.

Change: keep the version bump, and add a check that fails the build when a precached file changes and the cache string does not. Or use network-first for `/data/` when online.

### 14. `styles.css` is deployed and the page does not use it

- Severity: low. Confidence: high.
- `https://zg852.pages.dev/styles.css` returns 200, 24303 bytes. The live HTML links `/app.css` only. A search of the homepage for `styles.css` finds no match.
- The file is a full stylesheet (`:root` variables). It is 1369 bytes smaller than `src/styles.css`, so it is not the current source file.

Change: stop publishing this file.

## Checks that passed

### A. Headers on real files

`GET /` at 02:13 UTC:

- `200`, `content-type: text/html; charset=utf-8`, `cache-control: no-cache`
- `content-security-policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://tiles.openfreemap.org https://photon.komoot.io; worker-src blob: 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
- `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: strict-origin-when-cross-origin`
- `permissions-policy: geolocation=(), camera=(), microphone=()`
- `access-control-allow-origin: *` (Cloudflare)
- Cloudflare also sends `nel` and `report-to` toward `a.nel.cloudflare.com`, with `success_fraction` 0

`GET /app.js`: `200`, `application/javascript`, `cache-control: no-cache`, the same CSP. Wire size with gzip: 365473 bytes.

`GET /sw.js`: `cache-control: no-cache`, `service-worker-allowed: /`.

`GET /data/network.json`: `cache-control: public, max-age=3600`.

No mixed content. Homepage asset links (`/app.js`, `/app.css`, `/preview-noindex.js`) return 200.

Precache list, all GET:

| File | Status | Wire size (gzip) |
| --- | --- | --- |
| `/app.js` | 200 | 365473 |
| `/app.css` | 200 | 22380 |
| `/legal.css` | 200 | (small) |
| `/maplibre-gl-worker.mjs` | 200 | 156811, file 550754 |
| `/preview-noindex.js` | 200 | 182 |
| icons and `og-image.png` | 200 | og image 28149 |
| `/data/nodes.json` | 200 | 154639, file 811012 |
| `/data/network.json` | 200 | 588546, file 2228428 |
| `/data/districts.json` | 200 | 2321, file 6790 |
| `/data/poi-index.json` | 200 | 245094, file 1056069 |
| 15 × `/i18n/*.json` | 200 | 138 keys each |
| `/privacy.html`, `/terms.html`, `/credits.html` | 308 | stored by the worker anyway |

`graph.json` is not a deployed data file. The app does not request it. The URL falls into issue 1.

### B and C. Journey and other routes

Desktop, WebGL2 available, no console errors on the happy path.

| Pair | Meeting area | Longest | What the route did |
| --- | --- | --- | --- |
| Central → Sha Tin | Mong Kok area (Hk & Kln Chiu Chow School stop) | 20.8 min | TWL Central–Mong Kok 10.7 min, then walk. EAL Sha Tin–Mong Kok East 13.6 min. Fares HK$8.2 and HK$8.2 |
| Central → Kowloon Tong | Yau Ma Tei station | 15.1 min | TWL 9.9 min and KTL 9.2 min, plus short walks. Fares HK$6.5 and HK$6.5 |
| Kennedy Town → Shau Kei Wan | Causeway Bay | 19.4 min | Island line, 7 stops each way, about 15–16 min on the train |
| Central → Mui Wo Market | Tung Chung | 59.4 min | Bus E11 about 56 min, plus a local bus. No walking across the harbour |
| Tsim Sha Tsui → Airport | Tsing Yi | 33.9 min | See issue 4 |

Swap of Central and Sha Tin: the same three area titles came back. The fares swapped with the people. Fairness is symmetric for that pair.

Auto-recompute: after Central / Sha Tin, changing the first person to Kowloon Tong, with no Search click, replaced the list with Sha Tin and Tai Wai stops within about a second.

Three people (Central, Central, Tsuen Wan) produced Sham Shui Po, longest 18.6 min, three fares of HK$8.2.

Budget stored as 0 is clamped to 15 min on reload (`#budget` min is 15). Budget 180 drew 299 heat cells and did not freeze the page.

A pin at “Pin 22.5, 114” (north-west edge, map zoomed out to show Shenzhen, the islands, and Po Toi) showed: “A start place has no nearby transit stop within the travel budget.” The page stayed usable.

Recenter: on the map, same x as `.leaflet-control-zoom`, directly below it. `#recenter` is absent. Aria-label in English is “Recenter map”, and it translates (for example `zh-Hant` “重新置中地圖”).

Share wrote a `https://zg852.pages.dev/#s=eyJ…` URL to the clipboard and the button said “Share link copied”.

The Privacy dialog showed the privacy HTML, including the effective date 22 November 2026 and the `hkfair.v2.` key prefix.

### D. Search

Covered above. Photon debounce held at one request for a five-character query.

### E. Map

The fresh 390×844 screenshot shows Kowloon and the New Territories with labels, roads, and the harbour. A zoomed-out desktop view shows Lantau, Lamma, Po Toi, Clear Water Bay, and labels north of the border (Futian). No blank-tile region in those views. Zoom and recenter stay on the map at 1280, 1024, 768, and 360. No horizontal scroll at those widths (`scrollWidth - clientWidth` was 0).

### G. Worker update flow

See issue 3 and issue 13. Precache install succeeded in Chromium even though the three legal `.html` URLs redirect. The cache keys include `/privacy.html`, `/terms.html`, and `/credits.html`.

### H. Performance

Profile, twice, new browser context, cache disabled, service worker blocked, CPU 4×:

- Download 1.6 Mbps, upload 750 Kbps, latency 150 ms. This is the Fast 3G throughput pair with a 150 ms RTT.

| Run | Time to `h1` | Time to map canvas and status past “loading” | Transferred |
| --- | --- | --- | --- |
| 1 | 602 ms | 11249 ms | 1294824 bytes |
| 2 | 482 ms | 11106 ms | 1294783 bytes |

`network.json` starts at about 4.3 s and takes 6.6 s (588846 bytes on the wire). `app.js` takes about 2.0 s (365773 bytes). `nodes.json` takes about 1.7 s. `poi-index.json` is not in this load. It loads when interest preferences are turned on (245094 bytes on the wire).

The header status text changes from `loading` to `network ready`. There is no byte or percent progress.

One warm reload, cache already warm, no throttle: status ready in 306 ms.

Lighthouse 12.8.2, one run, homepage only:

| Category | Score |
| --- | --- |
| Performance | 86 |
| Accessibility | 96 |
| Best practices | 96 |
| SEO | 100 |

That run threw the WebGL2 error in issue 2, so it never fetched `network.json`. Its transfer total was about 391 KiB. FCP 3.2 s, LCP 3.3 s, TBT 10 ms. Treat the performance score as the cost of the shell, not the cost of the router.

Top Lighthouse items:

- Performance: unused JavaScript, about 286 KiB; render-blocking requests, about 450 ms; unused CSS, about 18 KiB.
- Accessibility: jyutping contrast 3.54:1. No other failed accessibility audit.
- Best practices: missing source maps; the WebGL2 console error from this headless run.
- SEO: no failed audits on the homepage.

### I. Accessibility

- Tab order through the header and the first cards is logical. Disabled “move up” on the first person is skipped.
- Focus ring is a 2px accent outline on buttons and text fields.
- The language `<select>` sets `outline: none`. The wrapper uses `focus-within` to change its border to the accent colour.
- Keyboard: focus the start field, type `Central`, ArrowDown, Enter. The field becomes `Central`.
- `#detail` is `aria-live=polite`. The results list is not a live region.
- Landmarks: one `header`, one `main`, two `aside` elements, two dialogs with labels.
- Every `button` had an accessible name. There were no `img` elements. Icon spans are `aria-hidden` inside named buttons.
- Screen reader: not tested.

### J. Mobile

- 390×844 fresh load: map about 390×405 under the header, legend readable, start field fully on screen (bottom at y=744). Screenshot shows a normal Hong Kong map.
- 360×640: no horizontal scroll. The start field’s box reached y=664, which is past a 640px screen, so the user scrolls to it. Zoom and recenter remain on the map.
- Targets: issue 9.
- On-screen keyboard: not tested. At 390×844 the start field sits about 100px above the bottom edge. A keyboard taller than that will cover it unless the page scrolls the field up. That scroll was not verified with a real keyboard.

### K and L

Homepage metadata passes. Legal body text matches the HTML sources (Privacy dialog and the fetched pages). Issue 10 and issue 12 are the gaps.

`LICENSE` is served as `application/octet-stream`. Low impact. The file is 1064 bytes and returns 200.

## Suggested order

1. Issue 2. A WebGL2 miss makes the product look down.
2. Issue 3. Offline reload is a broken promise of the worker.
3. Issue 1. The soft 404 breaks monitoring and the two live tests.
4. Issue 4. The Airport Express numbers are the routing defect a traveller would notice.
5. Issue 10. The privacy sentence is false on every cold load.
6. Issues 5, 6, 8, and 9. They are the everyday quality gaps.
7. Issues 7, 11, 12, 13, and 14.

## Data correctness, 23 November 2026

The question for this pass is whether the trips on screen are true. Each live case below was run twice on `https://zg852.pages.dev/`. The graph numbers come from `static/data/network.json`, `static/data/nodes.json`, and `static/data/raw/hk-community-gtfs.zip`.

### MTR-only does return trips

Turning the bus chip off, and leaving the MTR chip on, returns five areas for every pair below. The error box stays empty. The ride text contains MTR and no bus.

| Pair | Mode | First area | What the steps say |
| --- | --- | --- | --- |
| Tsuen Wan and North Point | both | Yau Ma Tei Exit C | Tsuen Wan person uses TWL, 11 stops, 19 min. North Point person uses bus 102P, 3 stops, 22 min. |
| Tsuen Wan and North Point | MTR only | East Tsim Sha Tsui station | TWL Tsuen Wan to Tsim Sha Tsui, 13 stops, 24 min. ISL plus TWL for North Point, longest 29.1 min. |
| Tsuen Wan and North Point | bus only | Hong Kong Palace Museum stop | PB4, 1 stop, 21.3 min. Bus 987, 1 stop, 15.6 min. |
| Central and Sha Tin | both and MTR only | Sai Yee Street bus stop | TWL Central to Mong Kok, 5 stops, 10.7 min. EAL Sha Tin to Mong Kok East, 3 stops, 13.6 min. |
| Central and Kowloon Tong | both and MTR only | Yau Ma Tei station | TWL 4 stops, 9.9 min. KTL 4 stops, 9.2 min. |

The same five rows came back on the second run of each case. MTR-only is not an empty search for these station pairs.

The default search still puts one person on a bus. The named meeting point for Central and Sha Tin is a bus stop even though both rides are MTR. A cell is named from the stops inside it. A cell with no station keeps the bus stop name. That is why the list looks like a bus result while the steps say MTR.

`tests/e2e.spec.js` has "MTR-only search still finds fair areas with default settings". It checks that heat cells appear for Tsuen Wan and North Point. It does not check a line name, a stop count, or a time. No test covers Central to Sha Tin, Central to Kowloon Tong, or the Airport Express edge.

### What in the graph is sound

Twenty-two known stations were compared with published positions. Every one is within 400 m. Central is 158 m off. Airport is 24 m off. Tsuen Wan is 4 m off.

Island line, Tsuen Wan line, Kwun Tong line, and East Rail list their stations in the real order, in both directions. There are 26 rail lines and 2873 bus lines. Rail `c` is 0. Bus `c` is 1.

Island line Kennedy Town to Chai Wan is 28.1 min of running time plus a 4.06 min wait. Tsuen Wan line Tsuen Wan to Central is 25.1 min of running time plus a 3.12 min wait. Those end-to-end totals are in the right range for those lines. Urban hops vary from about 0.8 min to about 3.3 min. They are not one formula.

The minutes shown on a ride leg are the line wait plus the hop times. The 102P leg of 22 min is a 12.0 min wait plus about 10 min of hops. The PB4 leg of 21.3 min is a 9.5 min wait plus one hop of 11.78 min. The wait is half the median headway, capped at 20 min, plus 1 min for rail or 2 min for bus.

### What in the graph is wrong

**Airport Express clocks in the feed are about twice the published journey.** Trip `MTR-AEL-DT` in the GTFS zip has these clocks:

| Stop | Clock |
| --- | --- |
| AsiaWorld-Expo | 00:00:00 |
| Airport | 00:02:00 |
| Tsing Yi | 00:26:28 |
| Kowloon | 00:37:29 |
| Hong Kong | 00:40:27 |

The builder copies the gap. The shipped edge Airport to Tsing Yi is 24.47 min for 18179 m, which is 45 km/h. The app then adds the 6.0 min line wait, and the screen says 30.5 min for that one hop. The MTR site says the Airport to city journey takes as little as 24 min. The feed already says 40 min 27 sec from AsiaWorld-Expo to Hong Kong. The router did not invent this number.

The same 45 km/h pattern covers 156 of 256 rail edges, within 0.4 min of distance divided by 45 km/h. The other 100 edges, mostly urban hops, do not fit that formula. Long edges that do fit it:

| Edge | Minutes | Metres | Speed |
| --- | --- | --- | --- |
| AEL Airport to Tsing Yi | 24.47 | 18179 | 45 km/h |
| AEL Tsing Yi to Kowloon | 11.02 | 8169 | 44 km/h |
| TCL Tung Chung to Sunny Bay | 13.72 | 10149 | 44 km/h |
| TCL Sunny Bay to Tsing Yi | 11.52 | 8564 | 45 km/h |
| TML Tsuen Wan West to Kam Sheung Road | 11.87 | 8837 | 45 km/h |
| EAL Lok Ma Chau to Sheung Shui | 8.75 | 6544 | 45 km/h |

**One Tsuen Wan line hop disagrees with itself.** Yau Ma Tei to Jordan is 3.28 min for 853 m. Jordan to Yau Ma Tei is 1.30 min for 851 m.

**Some bus hops are a long wait stored as travel.** Forty bus edges are shorter than 800 m and take at least 15 min. Examples from the shipped graph:

| Route | Minutes | Metres |
| --- | --- | --- |
| 88R, City One to Block 13 | 51.1 | 270 |
| 273A, Cheung Lung Wai Estate to Elegantia College | 22.9 | 270 |
| 81A, Fu Kar Court to Hacienda | 17.0 | 48 |
| 50M, Tuen Mun Fire Station to Tuen Mun Station Exit C1 | 23.2 | 432 |

The builder keeps any positive gap under 60 min (`scripts/build_graph.py`, the `0 < dt < 60` check) and stores the median. A layover in the feed becomes a ride.

**Ferries and light rail are stored as bus.** `agency.txt` has `FERRY` and `LR`. The exporter sets `c` to 0 only when `agency_id` is `MTRR`. Route 7006 is Mui Wo Ferry Pier to Central Pier 6, one edge, 55.00 min, 16454 m. The app labels that edge "Bus". The 55 min ferry time is plausible. The mode word is wrong.

**A direct bus edge can skip the stops in between.** Bus 987 connects Kam Hong Street to the Western Harbour Crossing interchange in one edge of 6.13 min. The screen says "1 stop, 15.6 min" because of the 9.5 min wait. The line on the map is that one chord.

### Fares stay a distance guess

Issue 4 stands. The AEL fare of HK$13.2 is the shared rail band, whose last step is HK$20.5. It is not an Airport Express fare. Urban examples such as Central to Yau Ma Tei at HK$6.5 are the same band. The page calls the figure an estimate.

### What to change in the data

1. Replace the AEL, TCL, TML, and Lok Ma Chau gaps that sit on the 45 km/h line with published run times, or stop drawing those edges until the feed is fixed.
2. Drop a bus or ferry hop whose implied speed is under about 5 km/h, or cap a hop by distance at walking speed. The 51 min hop of 270 m should not enter the graph.
3. Keep ferry and light rail out of `c = 1`, or give them their own label.
4. Add a graph test, not only a UI test. It should fail when the Airport to Tsing Yi edge is above 16 min, when any hop under 800 m takes 15 min or more, and when the Island line station order changes. The current MTR-only UI test would still pass if those numbers got worse.

## Live audit, 23 November 2026, 02:54 UTC

The question is what is still wrong on `https://zg852.pages.dev/` after the local fixes. The local graph script printed `ISSUE_COUNT 0`. The live `network.json` is a different file. The public worker is still `zg852-v21`.

| Area | Result | Why |
| --- | --- | --- |
| A. First load | ISSUES | Real pages return 200 and the security headers are present. Unknown paths return the home page with status 200. |
| B. Journey | ISSUES | Central pairs, auto-recompute, and recenter work. Two Central starts still say there are no route legs. |
| C. Route truth | ISSUES | Urban MTR pairs are plausible. Airport Express is 30.5 min and HK$13.2. Nam Cheong and Tuen Mun with MTR only returns nothing. |
| D. Place search | ISSUES | Five characters caused one Photon request. `zzzzqqqq` hid the suggestion list. |
| E. Map | PASS | Recenter sits under zoom at the same x. Tiles and a font file loaded. Phone width had no horizontal scroll. |
| F. Locales | ISSUES | 15 catalogs have 138 keys and no missing keys. Attribution stays English. Urdu does not move the people panel to the right. |
| G. Worker | ISSUES | Cache `zg852-v21`. `/` is not handled. `/data/` is cache-first. |
| H. Size and time | NOT TESTABLE | A cold Fast 3G run was not repeated this pass. |
| I. Access | ISSUES | Keyboard search selected Central. Subtle text is `rgb(154, 131, 126)`, about 3.55:1. No screen reader. |
| J. Phone | ISSUES | Targets are under 44px. The start field bottom is y=726 on an 844px screen. No real keyboard. |
| K. Bots | ISSUES | Homepage tags and the security headers are present. The sitemap still lists `.html` legal URLs. Legal pages omit `preview-noindex.js`. |
| L. Trust | ISSUES | A font file was requested. `PRIVACY.md` says font files are not requested. |

`TEST_BASE_URL=https://zg852.pages.dev npm test` failed 50 tests and passed 0. Every failure is the same wait. The test expects `html[data-net=ready]`. The live tag is `<html lang="en" dir="ltr">` with no `data-net`. The live ready signal is `#netstatus` text `network ready`.

### 1. The public site is still the old build

- Severity: high. Confidence: high.
- Expected: the public worker and graph match the tree that passed 50 local tests.
- Actual: `https://zg852.pages.dev/sw.js` starts with `const CACHE='zg852-v21'`. The live graph has only line codes 0 and 1. The local graph script, on `static/data`, printed codes 0, 1, 2, and 3 and `ISSUE_COUNT 0`.
- Evidence: two fetches of live `sw.js` this pass. One fetch of live `network.json`.
- Repro: `curl -s https://zg852.pages.dev/sw.js | head -c 40`.
- Change: deploy the current tree.

### 2. Live Airport Express time and fare are still the old numbers

- Severity: high. Confidence: high.
- Expected: Airport to Tsing Yi is a short Airport Express hop, and the fare is not the shared rail band.
- Actual: the live edge is 24.47 minutes for 18179 m. The screen, Tsim Sha Tsui and Airport, both modes, says `MTR AEL: Airport to Tsing Yi, 1 stop, 30.5 min` and `Fare HK$13.2`.
- Evidence: live `network.json` parsed this pass. One UI capture at 02:54 UTC. The MTR site says the Airport to city trip takes as little as 24 minutes, which is shorter than this one hop.
- Repro: search Tsim Sha Tsui and Airport on the live site.
- Change: deploy the rebuilt graph and the Airport Express fare table.

### 3. MTR-only Nam Cheong and Tuen Mun returns no areas

- Severity: high. Confidence: high.
- Expected: with a 90 minute budget and 10% tolerance, stations both people can reach appear.
- Actual, twice: 0 result rows. The error text is `No MTR-only areas fit this tolerance and budget. Enable bus or increase tolerance or budget.`
- Evidence: the same pair and the same error on two searches in one session.
- Repro: set Nam Cheong and Tuen Mun, turn the bus chip off, set the budget to 90, and search.
- Change: deploy the station gap rule. A station inside the budget stays when the gap is at most 8 minutes.

### 4. Unknown URLs return the home page with status 200

- Severity: high. Confidence: high.
- Expected: a missing path returns 404.
- Actual: `/definitely-not-a-page`, `/data/graph.json`, and `/_headers` each return 200, `text/html`, 15764 bytes. That is the home page size.
- Evidence: one curl pass over those three URLs.
- Repro: `curl -s -o /dev/null -w '%{http_code} %{size_download}\n' https://zg852.pages.dev/definitely-not-a-page`.
- Change: deploy `404.html` and turn off the Pages setting that serves the home page for unknown paths.

### 5. The live worker cannot serve a reload of `/`

- Severity: high. Confidence: high on the worker text. This pass did not repeat the offline browser reload.
- Expected: after one visit, a reload while offline shows the shell.
- Actual: the live fetch handler returns immediately when `path==='/'`. `/data/` is cache-first. `./index.html` is not in the precache list.
- Evidence: full text of live `sw.js`, fetched twice.
- Repro: read the fetch function in `https://zg852.pages.dev/sw.js`.
- Change: deploy `zg852-v24`, which keeps the shell and uses the network first.

### 6. Place search with no hits is silent

- Severity: medium. Confidence: medium. Observed once this pass.
- Expected: `zzzzqqqq` shows a no-match row.
- Actual: the suggestion list was hidden and its text was empty.
- Evidence: one type into `#start-p1`, then a 1.6 second wait.
- Repro: type `zzzzqqqq` on the live site.
- Change: deploy the settled-search message.

### 7. English remains after a locale switch, and Urdu stays left to right in the columns

- Severity: medium. Confidence: high.
- Expected: attribution, the credit line, `15 min`, `180 min`, and the zoom-in name change with the catalog. At 1280px, `.side-left` is on the right for Urdu.
- Actual: after `ur`, `dir` is `rtl`, the people panel x is 0, and the options panel x is 940. The credit line is `Inspired by FairPin PH. I have not used their service.` The budget ends include `15 min 180 min`. Zoom-in aria-label is `Zoom in`. The attribution still starts `Routing runs in this browser.` All 14 non-English catalogs copy the English `note.attribution`. Each live catalog has 138 keys.
- Evidence: one Urdu switch, then a reload that kept `hkfair.v2.locale` as `ur`. Catalogs fetched with curl.
- Repro: choose اردو on the live site.
- Change: deploy the translated catalogs and the RTL column fix.

### 8. Contrast and touch targets are still the old sizes

- Severity: medium. Confidence: high.
- Expected: subtle text on white is at least 4.5:1. The named controls are at least 44px.
- Actual: Jyutping color is `rgb(154, 131, 126)`, which is 3.55:1 on white. The start field is 39px. The library button is 28×28. The locale control is 22px tall. Focus options are 30px tall. Zoom and recenter are 30×30.
- Evidence: computed style at 1280×800, then `getBoundingClientRect` at 390×844. Start field bottom is y=726 on an 844px screen. `scrollWidth - clientWidth` was 0.
- Repro: open the live site and measure `#library` and `.jyutping`.
- Change: deploy the darker `--subtle` and the 44px controls.

### 9. Privacy still denies the font request the page makes

- Severity: medium. Confidence: high.
- Expected: the privacy text names font files from `tiles.openfreemap.org`.
- Actual: the first load requested `https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf`. Live `PRIVACY.md` line 27 says `Font glyph or sprite files are not requested.` The privacy HTML page does not name that host for fonts. Legal pages do not include `preview-noindex.js`. The sitemap locations are `https://zg852.pages.dev/privacy.html`, `terms.html`, and `credits.html`, and those URLs 308 to the extensionless paths.
- Evidence: the font URL from the browser session. `curl` of `PRIVACY.md` and `sitemap.xml`.
- Repro: load `/` with the network log open, then open `/PRIVACY.md`.
- Change: deploy the privacy sentence, the canonical links, and the sitemap.

### 10. Two Central starts say there are no route legs

- Severity: low. Confidence: high.
- Expected: the already-there sentence when the time is 0.
- Actual, twice: title `Central`, steps `Central No route legs are available for this place.`, fares `HK$0`.
- Evidence: two searches in the same session.
- Repro: set both starts to the Central station and search.
- Change: deploy the already-there sentence.

### Checks that passed on the live site

- `/`, `/privacy`, `/terms`, `/credits`, `/sw.js`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, both favicons, `og-image.png`, `/app.js`, `/app.css`, `/preview-noindex.js`, the map worker, and the four data files return 200.
- `/` sends `content-security-policy` with `script-src 'self'`, `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: strict-origin-when-cross-origin`, and `permissions-policy: geolocation=(), camera=(), microphone=()`. Cache-Control on `/` is `no-cache`.
- Central and Sha Tin, both modes: MTR TWL 10.7 min and MTR EAL 13.6 min. The title is a bus stop. That is a label, and the legs are MTR.
- Changing the first start to Kowloon Tong replaced the title without a Search click.
- Central and Kowloon Tong, MTR only: TWL 9.9 min and KTL 9.2 min. Fares HK$6.5.
- Kennedy Town and Shau Kei Wan: Island line both ways, about 15 to 16 minutes on the train, walks under 3 minutes.
- Recenter x is 896, the same as zoom, and it sits 10px under the zoom box.
- Typing `centr` with 120 ms between keys caused one Photon request.
- Keyboard type of Central, ArrowDown, and Enter set the field to `Central`.
- After use, `localStorage` keys are `hkfair.v2.people`, `hkfair.v2.settings`, `hkfair.v2.directory`, `hkfair.v2.geocache`, and `hkfair.v2.locale`.
- Hosts seen: `zg852.pages.dev`, `photon.komoot.io` is used by search, and `tiles.openfreemap.org` for tiles and fonts.

4. Add a graph test, not only a UI test. It should fail when the Airport to Tsing Yi edge is above 16 min, when any hop under 800 m takes 15 min or more, and when the Island line station order changes. The current MTR-only UI test would still pass if those numbers got worse.
