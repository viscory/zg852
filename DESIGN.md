# Design critique

## Current behaviour (authoritative)

This section is the truth for the current build. Everything below it is history, kept for context only, and never overrides it.

- There is one global Time/Fare toggle in the Parameters panel.
- Interest preferences are informational only and do NOT affect ranking.
- Results lead with a stored fit score (whole-minute longest + spread), then the displayed longest and spread as tie-breaks; Fare mode leads with the displayed fare gap then highest fare.
- Fare mode computes fares for all time-feasible cells.
- Interchange wait is shown as a separate note and is NOT included in leg minutes.
- The sidebar footer has the legal links plus a Beta-gated Diagnostics button (`#exportDiagnostics`) and its `#diagStatus` output; there is no attribution or inspiration note.
- The empty state uses `#goPlan`.
- The results count reads "Top {count} areas": only seven result rows are listed while up to 600 cells are drawn.

## History — superseded

This file records visual critiques of 就腳. The dated notes below are superseded records of earlier states. They do not describe the current build; use the authoritative section above and the code for current behaviour. Keep one size scale on `:root` when changing `src/styles.css`.

### 2026-11-25 Honest wording and disclosures (History — superseded)

The header subtitle now says "Find a fair meeting point in Hong Kong"; "most convenient for everyone" was dropped because the solver minimises a speed-and-spread score, not group convenience. The results count reads "Top {count} areas" because only seven rows are listed while up to 600 cells are drawn. (still true in current build) The tolerance labels say "Target time difference" and "Target fare difference", and a note under the slider states the floors that the percentage does not override: 8 minutes at stations, 5 minutes at other stops, HK$1 for fares. The dormant preference strings and their unused formatter are gone; hidden preference scoring was removed, but rankings still lead with a stored fit score (whole-minute longest + spread) that is not shown on the card, with the displayed values only as tie-breaks. (still true in current build) Turning Beta on now shows a note that Diagnostics downloads and copies names, start places and routes, and the Privacy page documents the export. A selected area's title now comes from the same stop used for its marker and routes instead of a higher-priority neighbour in the same grid cell.

### 2026-11-25 Fairness metric toggle and tolerance slider (History — superseded)

The Parameters panel now starts with a two-state **Time / Fare** toggle. Time is the default; Fare keeps the 150-minute travel budget, keeps the time-disparity filter, and ranks the time-feasible pool by the displayed fare tuple. The active metric owns the tolerance slider and the map heat colour; the legend text changes from "darker means shorter travel time" to "darker means cheaper fares". Time heat uses the slowest trip; fare heat uses the highest fare, while result order uses the displayed fare tuple. Each metric keeps its own percentage tolerance in settings and share links.

The tolerance slider starts at 5%, runs linear in 1% steps to 100%, logarithmic to 300%, then Unlimited. The DOM value is a slider position, while settings and share links continue to store the fraction. Fare disparity uses the same percentage shape with a HK$1.00 floor so a walk-only fare does not make the ratio meaningless.

MTR fares are looked up, not calculated from distance. `scripts/generate-mtr-fares.mjs` snapshots the Adult Octopus station-pair matrix and Airport Express table from MTR open data into `static/data/mtr-fares.json`; `railFare()` resolves each continuous paid-area rail run from its boarding and alighting stations. Bus and ferry fares are exact Transport Department full-fare snapshots; distance-band estimates apply only when a lookup is missing. (still true in current build)

Unlimited still respects the fixed 150-minute travel budget and each person's walk tolerance. A map pick only resolves to a stop everyone can reach within the budget after the final walk; if no such stop is close enough, the app shows a map notice that the point cannot be reached within 150 minutes instead of inventing a long walk from a distant stop. Pinned-point totals include the final walk, so the displayed total matches the route legs. Diagnostics export the active fairness metric, both tolerances and the travel budget.

The heatmap palette is a dark-maroon → red → orange → yellow sequence so adjacent fairness steps are distinguishable.

The map key and Interest ratings are proper disclosure panels with a +/− mark and a grid-row height/opacity transition. The desktop map key starts open; the mobile key starts closed; both can be collapsed. Fare heat shows how expensive the meeting is (highest fare), not how fair the fare spread is, while result ordering still uses the fare-disparity score. (still true in current build)

The desktop three-column shell, header, parameters sticky behaviour, results/footer, and people/detail flip are unchanged.

### 2026-11-23 Parameters, time-only ranking and headway control (History — superseded)

> Historical note kept for context. Both 2026-11-25 notes above supersede this one: the global Time/Fare toggle exists now and the current wording is set by those notes. See the authoritative section above for current behaviour.

The right sidebar's options panel is now the **Parameters** panel, and the sidebar itself is labelled "Parameters and results". In this superseded state, the global Time/Fare fairness metric had been removed: there was no fairness toggle, no `fairnessMetric` in settings or share links, no fare-based spread or longest value, and no fare-based ranking. Areas were ranked by travel time only; the spread and longest values stayed whole minutes. Fares were still estimated and shown for comparison in results and route steps, but never affected which area appeared first. (superseded — incorrect in current build: the Time/Fare toggle exists now, with fare-based ranking)

Parameters gain one global checkbox, `Include average headway` (`#includeHeadway`, i18n key `options.includeHeadway`). It defaults to on and is saved in `hkfair.v2.settings` and share links as `settings.includeHeadway`. When it is off, the average headway is neither charged at interchanges nor shown anywhere; when it is on, the existing interchange-only rule applies: every boarding pays the fixed line penalty, and half the day-average headway is added only when a ride follows another transit leg. The `Interchange wait N min` note appears only for those charged transfers.

Journey chips show one `route.stops` span per ride leg: the boarded and alighted stops joined by a Unicode arrow, `Start → End`. Full MTR line names remain (Tuen Ma Line, Tsuen Wan Line), and the old "Get on: X" / "Get off: Y" wording and three-letter codes are gone.

Pressing Find fair areas — either `#go` in the parameters panel or the empty-state button `#emptyRun` — reveals the leftbar's detail face as soon as a search succeeds, without clicking a result. (superseded — incorrect in current build: the empty-state button is `#goPlan`.) Automatic recomputes still leave the current face untouched, and `#swapFace` still flips between the people list and route detail explicitly.

The saved-people summary line is removed: `#saveSummary` and the `people.summary` key no longer exist. The saved-people library button in the header stays.

The sticky parameters panel in the right sidebar no longer leaves a scroll gap above the results: the results scroll directly beneath the solid sticky panel.

Unchanged from earlier critiques: per-person walk tolerance, whole-minute times everywhere, full MTR line names, the sticky rightbar two-column layout with the people/detail swap, and the interchange-note format and timing whenever the headway parameter is on. This section supersedes the older time-versus-fare fairness and save-summary notes below. It is in turn superseded by the two newer notes above, which restore the fairness toggle and set the current copy. (superseded — incorrect in current build: see the authoritative section above.)

### 2026-11-23 Interchange-only headway waits (History — superseded)

The wait model now has two parts. Each line in `network.json` carries `w`, a fixed boarding penalty (one minute on rail, two minutes on bus), and `h`, the duration-weighted average headway across the operating day, halved and capped at a sensible maximum. The solver charges `w` at every boarding, including the first. It charges `h` only when a ride is boarded after another transit leg — an interchange. The first transit boarding pays no headway wait because the traveller can time themselves rather than arrive at a random point in the headway. A leg therefore shows both its fixed boarding penalty and, after an interchange, its `interchangeWait` in minutes.

Ride legs carry `interchangeWait` (0 for a first boarding). The route detail shows a whole-minute note such as `Interchange wait 4 min` in the leg's `.leg-meta`, and `rideLegText()` adds the same note to the leg tooltip. Waiting time is shown separately and excluded from leg minutes; every displayed minute remains a whole number. (superseded — the earlier claim that waiting time was included in the leg's minute total is incorrect in current build.)

Earlier requirements are unchanged: full MTR line names, whole minutes everywhere, the trip-level time-versus-fare fairness metric, per-person walk tolerance, and the sticky-options two-column layout with the people/detail swap.

### 2026-11-23 Whole minutes, wait-aware rides and trip fairness (History — superseded)

Every minute value in the app is a whole number. Result spreads, longest times, per-person times, walk legs, and ride legs all use rounded minutes; no decimal point appears beside `min`. The ride time on a leg includes the average headway wait for that line, so it reflects the time someone actually spends waiting and riding rather than the in-vehicle time alone. (superseded — incorrect in current build)

MTR ride chips and leg labels use the full line name, such as `Tsuen Wan Line` or `Kwun Tong Line`. Three-letter codes such as `MTR TWL` do not appear in the interface. The graph can still carry short internal line codes; they are expanded for display.

The time-versus-cost choice is now one trip-level fairness metric in the options panel (`Time` or `Fare`), not a toggle on each person card. It is saved with the rest of the settings and travels in share links. In fare mode, the result spread and longest value are money amounts, using the same fare estimates shown in the route steps.

The two-column layout, the people/detail swap, and the per-person walk tolerance are unchanged.

### 2026-11-23 Person walk tolerance and sidebar faces (History — superseded)

Each person card has a walk-tolerance row directly below the start place field. It uses the same `.slider-row` type scale as the options tolerance: a 12px muted label, a tabular mono value, and a full-width range input with the shared 8px top margin shortened to 4px inside cards. The control stays inside the 8px card padding, runs 0–60 minutes in 5-minute steps, and defaults to 20 minutes. Its value uses the localised minute unit, like every other time in the app. No origin-hint line remains on the cards.

The left sidebar swaps between the people list and the selected route. The `.sec-title` keeps the swap icon button at the right edge and shows the people count only on the people face. The detail face holds the meeting-area card plus a small dashed hint using `map.areaHint`, which hides as soon as a route is selected. The right sidebar keeps a sticky options panel at the top with a solid background, a thin bottom border, and a soft shadow, so fair-area results scroll underneath it. The results heading and count sit with the results list, and the save summary and footer stay at the bottom.

### 2026-11-23 Header spacing, sidebar footer and route legs (History — superseded)

The header subtitle needs a 6px spacer underneath it before the header ends. That is a 6px gap below the subtitle line, not a larger title margin or a taller header.

The right sidebar ends with a footer separated from the options above it by a thin separator line. The footer holds the attribution note, the inspired-by note, and one row of legal links: Privacy, Terms, Credits, and Process. Process opens the page explaining routing, Photon, and OpenFreeMap. (superseded — incorrect in current build: the sidebar footer now has legal links only.)

Route leg cards in the detail panel use three rows: the person's name and fare on top, the leg icons with their line and stop labels in the middle, and the total time at the bottom. Leg icons keep the existing scale, 12px for legend-scale icons and 14px for card action and route icons. Ride lines follow the shapes in the GTFS feed rather than a straight join between stops; walking lines connect starts, stops, rides, and the meeting area.

### 2026-11-23 Beta badge (History — superseded)

The header starts with a Beta badge. It is the first control in the top right bar. Pressing it turns beta features on or off. The tooltip says which features that enables. Today that is interest preferences, which can change the areas on the map. (superseded — incorrect in current build: interest preferences are informational only and do not affect ranking.) The options panel does not repeat the badge, the switch, or the experimental note. The interest sliders appear only while the badge is on.

### 2026-11-23 Header icons (History — superseded)

The language control shows the language name and is wider than the saved-people button. Share sits under the search button.

The header has three buttons of one size. They are saved people, share, and language. Each button is `--field` on both sides. Each icon is 12px. The language button shows the globe only. The language name stays in the open menu. Share is not in a sidebar.

The left sidebar does not scroll sideways. Tooltips on the right edge of a panel open toward the inside, so they do not widen the panel. A text field uses `min-width: 0` so the field can shrink inside the panel.

### 2026-11-23 Compact chrome (History — superseded)

The icons and boxes are too large. A 44px field and a 44px icon button fill the side panels.

The compact scale is:

- `--icon` is 12px. Header icon buttons use that size. Card action icons, chip icons, and the search icon are 14px. Legend key icons stay 12px.
- `--field` is 36px. Text inputs, icon buttons, the locale control, fairness options, the search button, directory action buttons, and the map zoom and recenter controls use this height.
- `--header` is 52px. The logo is 28px. The title is 17px on a wide screen and 16px below 900px.
- A person avatar is 24px. A card has 8px padding. A category chip is 32px tall. The full-width add control uses `--field`.
- Body text stays 14px. The inline note icon button stays 24px.
- Side column widths stay 360px and 340px.

The page is a column. The header uses its content height. The layout fills the space that remains. A wrapped phone header does not use a fixed offset.

Add the next critique at the top of `## History — superseded` above. Name the part that is wrong and the size you want.
