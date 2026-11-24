# iPhone 15 frontend audit

Date: 2026-11-24T04:15:13Z  
Target: built `public/` output served on `http://127.0.0.1:4174/`  
Emulation: Playwright MCP, iPhone 15 descriptor (393×659 CSS viewport, 393×852 screen, DPR 3, `isMobile`, `hasTouch`, coarse pointer). WebKit browser installed; the live MCP session used Chromium with the iPhone 15 descriptor.

## What was checked

- Cold load, adding/reviewing people, parameter controls, tolerance modes, Search.
- Result list, result selection, route detail, interest accordion.
- Bounded heatmap tap targets/tooltips, unbounded pinned point.
- Header actions, diagnostics visibility, dialogs, footer, i18n-driven labels.
- DOM geometry, scroll containers, touch-target sizes, `elementFromPoint` hit testing, console output.

## Findings

1. **The mobile page is a 1,342px-tall stacked document inside a 547px scrollport.** Cold load measured `.layout` `scrollHeight: 1342`, `clientHeight: 547`. The user has to scroll through people cards, a 240px map, parameters and results before reaching the primary Search button (`#go` at `y=1101`, below the fold).
2. **The sticky footer overlaps the controls and results.** The 173px `.rightbar-footer` is stuck near the top of the right pane on cold load (`y=890`) while `#optionsPanel` starts at `y=907`, so the footer covers the parameters. After Search it sits at `y=502` and overlaps the first result row (`y=454`, height 121).
3. **The map is too small and disappears during use.** `#map` is only 240px high. After Search the layout auto-scrolls (`scrollTop: 245`), putting the map at `y=-101`; map interaction requires scrolling back to the top.
4. **Route detail overlaps the map.** `setSidebarFace('detail')` leaves the `flip-in` class on `#flipStage`; `.side-left:has(.flip-in){overflow-y:visible}` then makes the left grid row collapse from ~805px to 32px. The 705px detail panel paints over the map instead of participating in layout. Removing the stale class restores the row to 805px.
5. **Heat cells are effectively untappable.** Bounded mode produced 125 `path.heat-cell` elements with bounding boxes around 4×4px. At least one cell was covered by a station marker (`elementFromPoint` returned the marker path), so a finger tap cannot reliably select a cell.
6. **Tooltips are hover-only.** `#mapTooltip` appears after a 700ms `mouseover`. Touch devices do not generate a useful sustained hover, so the six interest bars were not discoverable by tapping.
7. **Touch targets are systematically too small.** 35 of 54 visible controls were below 44×44px: header actions 36px, locale select 34px, person/save/remove/pin 36px, mode chips 32px high, Go 36px high, range inputs 16px high, checkbox 14px, Leaflet zoom/recenter 36px, legal links about 14px high.
8. **Text entry risks iOS auto-zoom.** Text inputs use 14px font; iOS Safari zooms the viewport on focus below 16px.
9. **No safe-area handling.** Footer/sheet padding ignores `env(safe-area-inset-bottom)`, so controls can sit under the iPhone home indicator.
10. **Scroll chaining and viewport jumps.** The stacked layout has no `overscroll-behavior:contain` and uses fixed `100%` heights rather than `100dvh`; sheet/footer scrolling can chain into the document and shift the URL bar.
11. **The interest accordion works but is hard to reach.** It opens correctly with six bar rows, but sits inside the detail panel that overlaps the map and requires additional scrolling.
12. **Unbounded mode works functionally.** Setting tolerance to Unlimited and tapping the map produced a pinned point with a point banner, six rating bars and routes. The same overlapping/scroll problems still apply.

No console errors were observed; only tile/network warnings from the deliberately blocked external tile routes in the test harness.

## Chosen solution: adaptive command deck

Rather than build a second mobile app or duplicate markup, keep one DOM and reinterpret the existing regions on coarse-pointer phones:

- The map becomes the full-height base layer.
- The existing right and left sidebars become one bottom sheet with three panes: **People**, **Areas** (parameters + results), **Route** (route detail). The existing `swapFace` mechanism still selects the left-pane face.
- The sheet has three snap points — peek, half, full — driven by a drag/tap handle and stored in the shared `store`. Search opens Areas at half height; selecting a route/cell/pinned point opens Route at half height; tapping the Route nav opens it full height.
- A compact mobile nav sits above the map. Header actions and all controls get 44px minimum targets; text inputs use 16px to avoid auto-zoom; footer prose collapses to a legal link row.
- Bounded heat cells gain **magnetic selection**: a tap within 56px of a cell centre selects it and shows the bar tooltip immediately. This replaces hover-only exploration without changing desktop behavior.
- Selection fitting reserves top padding for the nav and bottom padding for the visible sheet, so routes stay in the map area.
- Beta preference sliders scroll inside the sheet instead of pushing results and legal links off-screen.
- CSS is isolated behind `@media (max-width:480px) and (pointer:coarse)`; desktop layout and behavior remain byte-for-byte in effect outside that query.
