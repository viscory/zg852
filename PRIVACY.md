# Privacy

Effective 22 November 2026.

就腳 runs in your browser. It has no account system and no application backend.

## What stays on your device

The app stores these values in browser `localStorage`:

- `hkfair.v2.people`: current people and start places
- `hkfair.v2.settings`: modes, tolerance, budget, and beta preferences
- `hkfair.v2.directory`: saved people library
- `hkfair.v2.geocache`: recent place-search results
- `hkfair.v2.locale`: selected language

Share links put the current scenario in the URL fragment. Anyone who receives the link can see that scenario. Do not put sensitive information into people names or start places if you plan to share.

Clear site data in your browser to remove stored values.

## External requests

The app makes these third-party requests from your browser:

- `photon.komoot.io` for place search. The text you type is sent as a search query.
- `tiles.openfreemap.org` for vector map tiles.
- Font glyph or sprite files are not requested. Icons are bundled locally.

These providers may see your IP address and standard request metadata and may keep logs under their own policies. 就腳 does not receive those logs.

The app does not use analytics, advertising, cookies, or tracking pixels.

## Offline cache

A service worker caches app assets, local data files, and translation catalogues so the app can load again later. Clearing site data removes this cache.

## Contact

Questions or privacy reports: open an issue at https://github.com/viscory/zg852/issues
