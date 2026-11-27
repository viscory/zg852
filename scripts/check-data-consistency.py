#!/usr/bin/env python3
"""Offline contract check for the shipped generated JSON snapshots.

Validates only what is committed: no generator runs and no network is used, so
this detects schema/provenance drift, not stale live feeds. Generators remain
manual maintenance tools because they need third-party hosts.
"""

import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / 'static' / 'data'
# Reasons emitted for fallback rows by scripts/build_hkbus_urls.py.
ALLOWED_FALLBACK_REASONS = {'no-matching-key', 'page-404'}
# Provenance markers emitted by scripts/generate-route-fares.py. A fare chosen
# by the disclosed higher-fare tie-break must not be labelled as an ordinary
# snapshot fare.
ALLOWED_FARE_SOURCES = {'td-full-fare', 'td-full-fare-tiebreak'}


def load(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))


def main():
    errors = []

    poi_sources = load('poi-index.json').get('sources')
    if not isinstance(poi_sources, list):
        errors.append('poi-index.json: sources is not a list')
    else:
        for source in poi_sources:
            text = str(source).lower()
            if 'overturemaps.org' in text or (text.startswith(('http://', 'https://')) and 'overture' in text):
                errors.append(f'poi-index.json: sources claims a fetched Overture URL: {source!r}')
        if not any('overture' in str(source).lower() and 'local' in str(source).lower()
                   for source in poi_sources):
            errors.append('poi-index.json: sources must describe the local, non-retained Overture input')

    meta = load('hkbus-meta.json')
    if not isinstance(meta, list):
        errors.append('hkbus-meta.json: expected a list of per-line statuses')
    else:
        for index, entry in enumerate(meta):
            if not isinstance(entry, dict):
                errors.append(f'hkbus-meta.json[{index}]: entry is not an object')
            elif (entry.get('status') == 'fallback'
                  and entry.get('reason') not in ALLOWED_FALLBACK_REASONS):
                errors.append(f'hkbus-meta.json[{index}]: unknown fallback reason {entry.get("reason")!r}')

    route_fares = load('route-fares.json')
    fares, sources = route_fares.get('fares'), route_fares.get('fareSources')
    if not isinstance(fares, dict) or not isinstance(sources, dict):
        errors.append('route-fares.json: fares and fareSources must both be maps')
    elif set(fares) != set(sources):
        missing = sorted(set(fares) - set(sources))[:5]
        extra = sorted(set(sources) - set(fares))[:5]
        errors.append(f'route-fares.json: fares/fareSources key sets differ (missing {missing}, extra {extra})')
    else:
        bad_sources = sorted({source for source in sources.values()
                              if source not in ALLOWED_FARE_SOURCES})
        if bad_sources:
            errors.append(f'route-fares.json: unknown fareSources values {bad_sources}')
        # A stale snapshot once labelled every fare, including tie-break picks,
        # as an ordinary published fare and carried a note confessing it.
        if 'note' in route_fares:
            errors.append('route-fares.json: stale note must be removed once per-row sources are real')

    metro = load('mtr-fares.json')
    if not isinstance(metro, dict) or not isinstance(metro.get('source'), dict):
        errors.append('mtr-fares.json: missing source field')

    if errors:
        for error in errors:
            print(f'data consistency: {error}')
        raise SystemExit(f'data consistency: {len(errors)} contract violation(s)')
    print('data consistency: shipped JSON contracts OK (offline)')


if __name__ == '__main__':
    main()
