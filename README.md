# zg852

Client-side Hong Kong fair meeting-point finder. Pick two or more start places, set a travel budget, and see fair areas on the map with segmented walking, rail, and bus routes. No account, no backend, no API keys.

Site: https://zg852.pages.dev/

## Run locally

```sh
npm install
python3 -m http.server 8765 --bind 127.0.0.1
```

Open http://localhost:8765/

## Tests

```sh
npm test
```

Playwright expects a local static server at `http://127.0.0.1:8765`.

## Build

```sh
npm run build
```

The static site is written to `public/`. Cloudflare Pages uses the same directory via `wrangler.toml`.

## Data and services

- Transit routing uses a local graph generated from a community-maintained Hong Kong GTFS feed. The raw feed is excluded from the repository and from `public/`.
- Place search uses the keyless Photon API from komoot.
- The basemap uses keyless OpenFreeMap vector tiles built from OpenStreetMap data.
- People, settings, saved profiles, locale, and a small geocoder cache stay in browser `localStorage`.

## Inspiration

Inspired by [FairPin PH](https://fairpin.ph/). I have not used their service. This project is independent and is not affiliated with or endorsed by FairPin PH.

## Legal

See `PRIVACY.md`, `TERMS.md`, `CREDITS.md`, and `THIRD_PARTY_NOTICES.md`. Published legal pages are in `privacy.html`, `terms.html`, and `credits.html`.

## License

MIT, see `LICENSE`. Third-party components keep their own licences, see `THIRD_PARTY_NOTICES.md`.
