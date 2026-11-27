---
name: audit-live-zg852
description: >-
  Audit the live 就腳 site at https://zg852.pages.dev/ for broken journeys,
  wrong transit times and fares, empty MTR-only search, silent place search,
  i18n leaks, service-worker offline failure, soft 404s, and privacy claims
  that do not match the network. Use when the user asks to audit, sanity-check,
  or QA zg852, the live Pages site, fair meeting points, MTR or bus results,
  or the shipped GTFS graph.
---

# Audit live 就腳

Audit `https://zg852.pages.dev/`. The source tree explains intent. The live origin is the subject.

Read [checks.md](checks.md) and run every area. Run `python .cursor/skills/audit-live-zg852/scripts/graph_sanity.py` from the repo root before judging route times.

## Rules

- Prove each issue twice. Record the URL, the input, the expected result, and the actual result.
- Test the live origin, but do not claim there is only one test command. Plain `npm test` builds `public/` and serves it locally at `http://127.0.0.1:8765` (this is what CI and the README use); `TEST_BASE_URL=https://zg852.pages.dev npm test` runs the smoke spec against the deployed origin instead. Either may write `public/` and `test-results/`.
- Do not commit, push, or deploy. Do not edit source except the report file the user named. If they name none, append `AUDIT-REPORT.md`.
- Playwright lives in `node_modules/@playwright/test`. Drive Chromium yourself. A subagent summary is not evidence.
- Severity and confidence are separate. A guess is a note, not an issue.
- Mark each area PASS, ISSUES, or NOT TESTABLE, with one line of why.

## Report

Append one section. Lead with the question the user asked. Then a table of areas, then numbered issues:

`Severity. Confidence. Expected. Actual. Evidence. Repro. Change.`

End with the checks that passed, including numbers. "Slow" needs a millisecond. "Wrong" needs the pair, the returned text, and the comparison source.

## Do not inherit old findings

Re-measure. These were true on 23 November 2026 and may have changed:

- MTR-only is not universally empty. Tsuen Wan plus North Point, Central plus Sha Tin, and Central plus Kowloon Tong returned MTR legs. Nam Cheong plus Tuen Mun at 150 minutes and 10% tolerance can return nothing because `buildCells` drops a station unless the slower time is within `max(fastest, 5) * (1 + tolerance)`.
- A cell titled as a bus stop can still have MTR legs. The title is the best stop inside the cell. Kind 2 platforms are not candidates.
- Airport Express Airport to Tsing Yi was 24.47 minutes in the feed, about 45 km/h, plus a 6 minute wait on screen. The MTR site says the Airport to city trip takes as little as 24 minutes.
- Bus hops under 800 m can take 15 minutes or more because the builder keeps any gap under 60 minutes.
- Ferry agency `FERRY` and light rail agency `LR` are easy to store as bus (`c` 1).
- `/_headers` is not a public file. Unknown paths can return the home page with status 200. Judge the `Content-Security-Policy` header on `/`, not the body of `/_headers`.
- An offline reload fails if the worker does not handle `/`. Precache of `app.js` is not proof that reload works.
- `createMap()` runs before the rest of `init()`. A WebGL2 failure can leave the status on loading and the card list empty.
- Font glyphs are requested from `tiles.openfreemap.org/fonts/`. A privacy sentence that denies font requests is a defect if that request still happens.
