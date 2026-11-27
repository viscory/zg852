# Privacy

Effective 22 November 2026.

就腳 runs in your browser. It has no account system and no application backend.

## What stays on your device

The app stores these values in browser `localStorage`:

- `hkfair.v2.people`: current people — names, start places, and per-person walk tolerance
- `hkfair.v2.settings`: modes, tolerance, the `includeHeadway` parameter (on by default), and beta preferences
- `hkfair.v2.directory`: saved people library, including each saved walk tolerance
- `hkfair.v2.geocache`: recent place-search results
- `hkfair.v2.locale`: selected language
- `hkfair.v2.selection`: selected area or cell and any pinned meeting point
- `hkfair.v2.previousScenario`: backup of the previous people, settings, locale and selection when a share link replaces the local scenario
- `hkfair.v1.locations`, `hkfair.v1.modes`: legacy v1 keys read only to migrate older saved data

Share links put the current scenario in the URL fragment, including the `includeHeadway` setting. The selected result (the chosen area/cell) and any pinned meeting point are also encoded in the URL fragment. Walk tolerance stays with each person. Anyone who receives the link can see that scenario. Do not put sensitive information into people names or start places if you plan to share.

Clear site data in your browser to remove stored values.

## External requests

The app makes these third-party requests from your browser:

- `photon.komoot.io` for place search. The text you type is sent as a search query.
- `tiles.openfreemap.org` for vector map tiles.
- Font glyph files from `tiles.openfreemap.org` for map labels. Icons are bundled locally.

These providers may see your IP address and standard request metadata and may keep logs under their own policies. 就腳 does not receive those logs.

The app does not use analytics, advertising, cookies, or tracking pixels.

## Offline cache

A service worker caches app assets, local data files, and translation catalogues so the app can load again later. Clearing site data removes this cache.

## Diagnostics export

Turning on Beta features reveals a Diagnostics button in the footer. Pressing it downloads a JSON file and copies the same text to your clipboard. The file contains your people's names, start places (including coordinates), routes, fares, settings, and the current page URL. The app does not send this file anywhere; only you decide what to do with it.

## Contact

Questions or privacy reports: open an issue at https://github.com/viscory/zg852/issues
