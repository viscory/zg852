# Full qualitative audit — PC and mobile

Date: 2026-11-24  
Build audited: `a7caad2` (`feat: adaptive mobile command deck for phones`)  
Served output: built `public/` at `http://127.0.0.1:4174/` (never the source tree)  
Method: Playwright MCP against the built output, plus read-only source review. No application code was changed.

## Scope and viewports

- **PC:** 1440×900, Chromium.
- **Phone:** iPhone 15 descriptor, 393×659 CSS viewport, coarse pointer.
- **Additional touch/viewport probes:** 852×393 landscape phone, 768×1024 coarse-pointer tablet, 320×568 small phone.
- **Network/storage probes:** blocked `data/nodes.json`, disabled `localStorage`, blocked map/data resources, offline reload.
- **Flows checked:** cold load, Search, result selection/detail, heat-cell hover/tap, language switching, RTL, saved-people library, pin mode, share links, diagnostics export, legal dialogs, keyboard autocomplete, offline reload, and landscape/tablet fallback.

Diagnostics export, legal dialogs, share-to-clipboard, basic autocomplete, offline data/search, and 320px portrait mostly worked; they are not counted below.

## The 20 very bad issues

Severity is qualitative: **Critical** = data loss or app unusable; **High** = core task blocked or materially wrong; **Medium-high** = serious usability, compliance, or performance defect.

### 1. Mobile map fitting double-counts the bottom sheet and hides the selected route — **Critical** (Mobile)

`src/js/map.js:126-132` returns `[topInset, sheetHeight]` from `mapPadding()` and passes that **same array** as both `paddingTopLeft` and `paddingBottomRight` to `fitBounds()`. Leaflet adds both paddings, so on a 659px phone it reserves roughly 818px of vertical space in a 240px visible map area.

Evidence: after Search and result selection on iPhone 15, the sheet handle top was `y=258`, but route paths rendered from `y=-4` to `y=720`; selected point markers were observed at `y=668`/`y=675`, entirely below the viewport. Recenter did not help. The user taps a result and sees a world view or a route hidden behind the sheet.

### 2. A single failed startup fetch or storage write leaves a blank app with no inline error — **Critical** (Both)

`src/app.js:15-35` has no top-level catch; `Promise.all` fetches `nodes.json`, `districts.json`, and the locale catalogue without checking `res.ok`; `src/js/state.js:34-39,65` and `src/js/i18n.js:98` write `localStorage` unguarded.

Evidence: with `data/nodes.json` aborted, the page had `cards: 0`, `data-net: null`, empty `#error`, and only console errors `Failed to load resource: net::ERR_FAILED` / `Failed to fetch`. With `Storage.prototype.setItem` throwing `QuotaExceededError`, the result was the same: no cards, no network state, no visible error.

### 3. Saved-people IDs collide after reload; edit/delete targets the wrong person — **Critical** (Both)

`src/js/store.js:5` resets `directorySeq = 1` on every load; `src/js/state.js:67-74` restores profiles but never restores the sequence. New profiles therefore reuse persisted `d1`/`d2` IDs.

Evidence: saved `Person A` and `Person B` (`d1`, `d2`), reloaded, added a third person with an origin, and saved. Stored directory became `d1 Person A`, `d2 Person B`, `d1 Person C`. Opening Saved people showed only one `d1` row (Person C), and editing/deleting by ID resolves to the wrong profile. This is silent data corruption.

### 4. Deleting every saved person is undone on reload — **Critical** (Both)

`src/js/state.js:67-74` repopulates an empty directory from current people and immediately writes it back.

Evidence: after deleting all three saved profiles, `localStorage.directory` was `[]` and the dialog showed “No saved people yet.” After closing, reloading, and reopening, the stored directory was again `Person A`, `Person B`, `Person C` and all three rows were back. A deliberate delete cannot stick.

### 5. Shared scenarios disappear on reload once the hash is consumed — **Critical** (Both)

`src/app.js:25` applies a shared hash, and `src/js/state.js:112-124` strips `#s=…` with `history.replaceState()` but never persists the imported state. The `else` branch that would restore/save local state is skipped.

Evidence: in a fresh isolated context, a share link showed `Person A` renamed to `Alex` with `localStorage.people: []`; after reload it showed `Person A` again and `localStorage.people: ["Person A","Person B"]`. The recipient loses the shared scenario on the first refresh.

### 6. Desktop sticky footer overlaps result rows — **High** (PC)

Evidence: at 1440×900 after Search, `.rightbar-footer` top was `y=727`; result rows 2 and 3 extended behind it. The right sidebar had `scrollHeight 1452` vs `clientHeight 848`. Rows are partially or fully unreadable/unclickable unless the user scrolls past the overlap.

### 7. RTL locale breaks the entire desktop layout — **High** (PC)

Evidence: switching to Urdu set `dir=rtl`, `scrollX=-234`, `htmlX=234`, `documentElement.scrollWidth=1675`, and `innerWidth=1675`. The whole application shifts sideways and gains horizontal overflow. The same RTL rules apply to the other RTL catalogues.

### 8. Landscape phones and larger touch devices revert to a broken stacked layout — **High** (Mobile/tablet)

The mobile command deck is gated by `@media (max-width:480px) and (pointer:coarse)`. Common touch viewports outside that narrow box get the old stacked fallback.

Evidence: 852×393 with coarse pointer reported `mobileCss=false`, left sidebar height `32px`, map `y=144 h=240`, and `#go` at `y=599` (below the fold). At 768×1024 coarse, the page stacked to `left y=112 h=1501`, map `y=1613 h=240`, right `y=1853`, and `#go` at `y=2068`. The primary action is effectively unreachable without a long scroll.

### 9. Mobile results sheet is unusably short — **High** (Mobile)

Evidence: in the default half snap, `.results-section` was `y=516 h=70`, footer `y=586`, and the first result `y=542 bottom=667`; only about 44px of the first result was visible. Even the full snap gave results only 136px. Users cannot compare results without fighting the sheet.

### 10. Removing a pinned person leaves pin mode permanently stuck — **High** (Both)

`src/js/ui.js:232` removes the card but never calls `clearPinMode()`; `src/js/map.js:82-85` keeps routing clicks to `setPinOrigin()` for the deleted ID, which no-ops at `src/js/ui.js:284-285`.

Evidence: pinning Person A, clicking Remove, then clicking the map left `#pinBanner` visible and `#map.pinning` set; the banner still read “Pinning Person A” and the map click did nothing. There is no visible way to cancel except reloading.

### 11. Mobile recomputes yank the user out of the pane they are editing — **High** (Mobile)

`src/js/engine.js:57` → `src/js/ui.js:107` calls `setMobilePane('results')` on every debounced recompute.

Evidence: on iPhone 15, switching to the People pane (`pane=people`) and changing the walk slider produced `pane=results` about 1s later. Any setting change interrupts the user's current task.

### 12. Changing language destroys an in-progress place search and focus — **High** (Both)

`src/js/i18n.js:101` calls `rerender()`, and `src/js/ui.js:242-247` rebuilds all cards.

Evidence: with `Central` typed into `#start-p1`, four suggestions open, and focus in the input, selecting Traditional Chinese changed the value to `Tsuen Wan`, removed all suggestions, and left focus on `BODY`. In-flight geocoding work and the user's query are discarded.

### 13. Renaming a person leaves stale names in existing results and route steps — **High** (Both)

`src/js/ui.js:214` only saves and refreshes metadata; result rows and route steps are rendered with `displayName()` elsewhere and are not refreshed.

Evidence: after Search and selecting a result, renaming Person A to `Alex` updated the card but result row 2 and the selected route step still read “Person A” (and still showed the `PA` avatar). The displayed itinerary contradicts the input.

### 14. Mobile hides the map attribution and legend — **High** (Mobile/compliance)

Evidence: on iPhone 15, both `.leaflet-control-attribution` and `.legend` had computed `display:none`. OpenStreetMap/OpenFreeMap attribution is removed from the visible experience, and the heat colours have no explanation on the only viewport where the map is the primary surface.

### 15. Offline reload emits worker URL errors — **High** (Offline)

Evidence: after an offline reload, the console showed six `Worker failed to load. Check that the worker URL is correct.` errors. The likely cause is the service-worker query-string/cache-key mismatch around `maplibre-gl-worker.mjs` and cache `zg852-v42` in `static/sw.js`. Application data/search still worked, but the map worker layer is degraded and the console is noisy.

### 16. Service worker caches failed responses as if they were assets — **Medium-high** (Offline)

`static/sw.js:8-10` clones every same-origin GET into the cache regardless of `res.ok`. A transient 404/500 for a data or catalogue URL can be replayed offline and can even beat the `index.html` navigation fallback because a cached response exists. Combined with issue 15, offline behavior is not trustworthy.

### 17. Map cells and list semantics are largely inaccessible — **Medium-high** (Accessibility/Both)

Evidence: heat cells are ~29px SVG `path.heat-cell` nodes with no `tabindex`, `role`, or `aria-label`; keyboard users cannot discover or select them. Additionally, `src/index.html:192,220` declare `role="list"`, but `src/js/ui.js:108,323` render buttons/divs without `role="listitem"`. The primary map interaction is pointer-only and the list semantics are incomplete.

### 18. Unlimited mode invites taps that do nothing before the first Search — **Medium** (Both)

`src/js/map.js:82-86` shows the “tap anywhere on the map” hint while `store.effectiveGrids` is still unset; `selectPoint()` returns immediately at `src/js/map.js:294-295`.

Evidence: with a fresh load, setting tolerance to `3.05` showed the hint “Unlimited mode is on: tap anywhere on the map to choose a meeting point.” with zero results. Clicking the map produced no point banner, no detail, and no error. The UI promises an interaction that is not yet available.

### 19. Switching locale leaves default person names untranslated — **Medium** (Both)

Evidence: after changing to Traditional Chinese, placeholders became `第 A 位成員姓名` / `第 B 位成員姓名`, but the name input values remained `Person A` / `Person B`. The default identity labels are generated once and persisted/stored before the locale change, so the interface is half-translated.

### 20. The app ships an unusually large uncompressed payload — **Medium-high** (Performance/mobile)

Evidence: built assets include `public/app.js` 1.3MB, `public/app.css` 141KB, and `public/data/network.json` 5.7MB; total relevant assets about 10.1MB. A request with `Accept-Encoding: gzip` still returned `network.json` as 5,892,100 bytes of `application/json` from the serving setup. On a phone or poor connection this makes first load expensive, and it amplifies every startup-failure path above.

## Bottom line

The desktop concept works for the happy path, but several state-management defects cause silent data loss (issues 3–5), and one failed request or blocked storage blanks the app (issue 2). On mobile, the command deck is a good direction but is excluded from landscape/tablet touch viewports (issue 8), the sheet is too short to use (issue 9), and the map fit logic actively hides the selected route (issue 1). These are the first issues I would fix.
