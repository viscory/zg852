# Canonical constants

`constants.json` in this directory is the single source of truth for numbers
shared by the browser app, the offline graph builder and the deployment guard.
No module may keep a private copy of one of these values.

Namespaces keep identical numerals with different meanings distinct:

| Namespace | Owner | Examples |
| --- | --- | --- |
| `shared` | unit conversions and coordinate precision | `metresPerKm`, `earthRadiusM`, `coordinateDigits` |
| `graph` | `scripts/build_graph.py` | `walkSpeedKmh`, `walkRadiusM`, `edgeMinMinutes`, `estimatedSpeedsKmh` |
| `runtime` | `src/js/config.js` and its consumers | `travelBudgetMinutes: null`, `defaultModes`, `fareWalkLimitMinutes`, `modeBits`, `nodeKinds`, `rankingWeights` |
| `fares` | fare-band lookups | `railBands`, `lightRailFares`, `busBands` |
| `hkbus`, `poi`, `build` | their generators and the finalize step | limits, timeouts, port |
| `sw` | `static/sw.js` | `cacheVersion`, `assets` |

`Infinity` cannot be represented in JSON. The fare-band upper bounds use the
string `"Infinity"`; `src/js/config.js` decodes it back to the JavaScript value.

## Provenance

- Walking pace and detour are assumptions, not surveyed measurements. The
  400 m `walkRadiusM` is a named boundary; there is deliberately no neighbour
  count cap, so every stop inside the radius gets a walk edge.
- `edgeMinMinutes` repairs non-positive consecutive stop times; no timed hop is
  dropped. Trips without clock times derive per-hop durations from
  `estimatedSpeedsKmh` (shape distances, then haversine).
- `defaultHalfHeadwayMin` is used only when a line publishes no frequency row.
  Published half-headways are uncapped, so an infrequent ferry can contribute a
  very large interchange wait.
- `travelBudgetMinutes: null` means unbounded routing. Consumers use
  `currentTravelCap()` (`Infinity`) for arithmetic; the null marker is only
  exported in diagnostics and documentation.
- `sw.cacheVersion` must match `const CACHE=` in `static/sw.js`; the finalize
  step fails the build on drift.

Changes to these values must be made here, then propagated by the loaders:
`scripts/_constants.py` for Python, `src/js/config.js` for the browser bundle.
`npm run lint` runs `scripts/check-constants.py` to enforce the contract.
