# Fresh audit round 2 — 20 new problems

Date: 2026-11-24  
Build audited: `c67964e` (`fix: preserve saved names and shared point display`)  
Served output: built `public/` at `http://127.0.0.1:8878/` (never the source tree)  
Method: Playwright against the built output plus read-only source review. No application code was changed.  
Scope: 1440×900 desktop, 800×600 fine-pointer desktop, iPhone 15, 852×393 coarse landscape, 768×1024 coarse tablet, RTL/i18n, dialogs, share links, persistence, keyboard/autocomplete, offline/SW paths.

The 20 findings in `docs/full-audit.md` and close variants are excluded. Severity here is deliberately conservative: **High** = wrong task result or state loss, **Medium** = core flow degraded, **Low** = small but reproducible correctness, accessibility, or polish defect.

## 1. Typed start-place text is ignored unless a suggestion is clicked — **High** (PC + mobile)

`src/js/ui.js:225-240` only runs autocomplete on input; `person.origin` is written by `setOrigin()` at `src/js/ui.js:148-154`. Typing a valid place name without choosing a suggestion never changes the origin used by `src/js/engine.js:15`.

Evidence: changed `#start-p1` from `Tsuen Wan` to `Kowloon Tong`, pressed Search. The input showed `Kowloon Tong`, but stored origin and routing still used `Tsuen Wan`.

## 2. Deleting down to one person silently restores both defaults — **High** (PC + mobile)

`restoreState()` at `src/js/state.js:86-95` requires at least two stored people; a one-person scenario is discarded and `defaultPeople()` is written back.

Evidence: deleted Person B, renamed the remaining person to `Solo`, reloaded. Before: 1 card, `Solo`. After: 2 cards, `Person A` / `Person B`.

## 3. Eight-person limit is silent and Saved-people Add/Edit appear to work — **Medium** (PC + mobile)

`src/js/app.js:67` disables the Add card button without explanation. `addDirectoryPerson()`/`editDirectoryPerson()` at `src/js/ui.js:366-375` silently no-op at the limit, but the click handler at `src/js/ui.js:390-396` still closes the dialog.

Evidence: at 8 people, `#add.disabled=true`; clicking Add in Saved people closed the dialog, people stayed at 8, and `#error` stayed hidden.

## 4. Result rows lose button semantics — **Medium** (Accessibility, PC + mobile)

`src/js/ui.js:116` renders each result as `<button role="listitem">`. The explicit role overrides the native button role, so assistive technology announces a list item rather than an actionable control.

Evidence: all 7 rows were `BUTTON` with `role="listitem"`; `onclick` still worked.

## 5. Late place-search results reopen dismissed suggestions — **Medium** (PC)

`renderSuggestions()` at `src/js/ui.js:180-186` lets Escape hide the panel, but the in-flight Photon timer/request from `src/js/ui.js:233-239` is not cancelled. Pin mode at `src/js/ui.js:331-341` has the same gap.

Evidence: typed `Central`, pressed Escape (`suggest-p1.hidden=true`), then a delayed Photon response arrived and `hidden=false`.

## 6. Narrow fine-pointer desktop still gets the stacked fallback — **Medium** (PC 800×600)

The adaptive deck is gated by `(pointer:coarse)` in `src/styles.css:359`, while the stacked fallback applies at `max-width:900px` in `src/styles.css:341-357`.

Evidence: 800×600 with mouse pointer reported `--mobile-deck=0`, one-column layout, `#go` bottom `y=1123.9` against `innerHeight=600`, layout `scrollHeight=1308` / `clientHeight=488`.

## 7. Process dialog link navigates away from the app — **Medium** (PC + mobile)

`openLegal()` injects the fetched document at `src/js/ui.js:428-435`. It strips `<nav>` elements, but `src/process.html:43` also contains an inline `<a href="privacy.html">Privacy</a>` in the body. Clicking it navigates the whole page.

Evidence: opening Process and clicking its body Privacy link ended at `http://127.0.0.1:8878/privacy.html`.

## 8. Selected area is not remembered across reload — **Low** (PC + mobile)

`saveSelection()` at `src/js/state.js:135-147` is only called during startup/share import. Selection handlers at `src/js/map.js:332-336` and the point/cell paths never call it.

Evidence: selected `Mong Kok` (row 2), reloaded, searched again; selection reverted to row 0 (`Hong Kong Palace Museum`) and `localStorage['hkfair.v2.selection']` remained `null`.

## 9. Pin banner and Unlimited hint overlap — **Low** (PC + mobile)

Both are absolutely positioned at `top:16px` inside `.main` (`src/styles.css:217,221`, mobile override at `:425`). Starting pin mode while Unlimited is ready shows both at once.

Evidence: hint box `top=68 bottom=118 left=545 right=915`; pin box `top=68 bottom=118 left=635.8 right=824.2`; overlap area `9420px²`.

## 10. Pinned-point banner stays after selecting another area — **Low** (PC + mobile)

`selectResult()` at `src/js/map.js:332-336` does not clear `store.pointSelection` or call `applyUnboundedUi()` (`src/js/ui.js:57-63`).

Evidence: pinned a free point (`detail=Pinned point`, banner visible), then clicked result row 1 (`detail=Prince Edward`); banner remained visible with `selected=1`.

## 11. Malformed share links fail silently — **Low** (PC + mobile)

`readHashState()`/`applySharedState()` at `src/js/state.js:180-196` clear an invalid hash and fall back to local state without a user-visible message.

Evidence: opened `/#s=not-valid-base64!!`; hash became empty, `#error.hidden=true`, no message.

## 12. Incomplete share links are silently rejected — **Low** (PC + mobile)

`applySharedState()` at `src/js/state.js:191-207` requires at least two usable people and otherwise clears the hash.

Evidence: a validly encoded share state with one person loaded as `Person A` / `Person B`, hash empty, no error.

## 13. Mobile legend omits route/pin/recenter explanations — **Low** (Mobile)

`src/styles.css:429` hides `.route-key`, `.vector-key`, `.pin-key`, and `.recenter-key` in the coarse-pointer deck. The visible legend therefore explains heat colour but not the route line styles or pin/recenter controls.

Evidence: legend `display=grid`, but route/pin/recenter/vector keys all `display:none`.

## 14. Long translated tolerance labels are clipped on mobile — **Low** (Mobile / i18n)

The compact options grid caps `.tolerance-row label` at `max-height:28px; overflow:hidden` in `src/styles.css:398`. Longer translations do not fit.

Evidence: German label needed `scrollHeight=55px` but had `clientHeight=28px`; text: “Wie viel länger die langsamste Fahrt als die schnellste dauern darf, in Prozent.”

## 15. Search error is an invalid listbox child — **Low** (PC + mobile)

`renderSuggestions()` at `src/js/ui.js:167-178` appends `.suggestion-error` directly inside `#suggest-*` (`role="listbox"`, `src/index.html:217`) without `role="option"`.

Evidence: parent role `listbox`, child `DIV` with no role, text “Place search is unavailable. Pick a transit stop or use a map pin.”

## 16. Active autocomplete option is never marked selected — **Low** (PC + mobile)

`highlight()` at `src/js/ui.js:160-165` updates `.active` and `aria-activedescendant`, but every option is created with `aria-selected="false"` at `src/js/ui.js:171-173`.

Evidence: after ArrowDown, `aria-activedescendant=suggest-p1-option-0` matched the `.active` row, but all option `aria-selected` values were still `false`.

## 17. Heat-cell keyboard focus reveals no detail tooltip — **Low** (PC)

`drawCloud()` at `src/js/map.js:170-190` wires mouseover/mousemove tooltips and sets `data-focused` on keyboard focus, but no focus handler shows the rating tooltip. No CSS consumes `data-focused`.

Evidence: focused heat cell had `tabindex=0`, `role=button`, `aria-label="Meeting area: 18 min"`, `data-focused`; `#mapTooltip.hidden` stayed `true` for 900ms.

## 18. Recenter can drop a manually selected heat cell off-screen — **Low** (PC)

`recenterMap()` at `src/js/map.js:144-147` fits results, origins and explicit point selections. A cell selected via `selectCell()` but absent from the top-results list is drawn by `renderSelection()` at `:308-309` yet omitted from the fit.

Evidence: after selecting heat cell #22 of 125 and pressing Recenter, the point marker was at `(1043,47)` while the map box was `left=360 right=1100 top=52 bottom=900` — above the visible map.

## 19. Legal dialog bodies stay in English — **Low** (PC + mobile / i18n)

`openLegal()` at `src/js/ui.js:420-435` translates only `#legalTitle`; the fetched document is injected verbatim, so translated locales still show an English body with no `lang` metadata.

Evidence: in Hindi, title was `गोपनीयता`, body began “Privacy / Effective 22 November 2026…”, and `#legalBody.lang` was empty.

## 20. Mobile navigation group keeps the wrong accessible name — **Low** (Mobile)

`src/index.html:71` labels `#mobileNav` as “Fair areas”. `setMobilePane()` at `src/js/mobile.js:25-39` updates pressed states and the sheet-handle label but not the group label.

Evidence: on iPhone, after selecting Route, `[data-mobile-pane="route"].aria-pressed=true` but `#mobileNav.aria-label` was still “Fair areas”.

## Verification notes

- All 20 were reproduced against built `public/` output with Playwright; raw probe reports are in `/tmp/opencode/audit-find20*.json` and `/tmp/opencode/audit-banner-report.json`.
- Screenshots captured: `/tmp/opencode/find20-narrow.png`, `/tmp/opencode/find20-mobile.png`, `/tmp/opencode/find20-banner-overlap.png`.
- Map tiles, Photon (except its dedicated probe) and `sw.js` were blocked where noted to make runs deterministic; those blocks are not themselves counted as app defects.
- No application source files were modified by this audit.
