#!/usr/bin/env python3
"""Regenerate static/data/route-fares.json from Transport Department open data.

The GTFS feed has no fare_attributes.txt, so distance bands cannot produce
honest bus fares. This script snapshots the Transport Department's adult full
route fares and attaches them to the bundled network line indexes.

Build-time dependency: pip install access_parser

By default the committed local .mdb snapshots in static/data/raw are read
(``--offline`` is just the explicit spelling of this default). Pass
``--refresh`` to download the pinned inputs again; downloads are verified
against the SHA-256 manifest below before they are written.
"""

import argparse
import hashlib
import json
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote
from urllib.request import Request, urlopen

from access_parser import AccessParser

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'static' / 'data' / 'raw'
OUT = ROOT / 'static' / 'data' / 'route-fares.json'
BASE = 'https://static.data.gov.hk/td/routes-and-fares/'
FILES = ('ROUTE_BUS.mdb', 'ROUTE_GMB.mdb', 'ROUTE_FERRY.mdb')
DATASET = 'https://data.gov.hk/en-data/dataset/hk-td-tis_3-routes-and-fares-of-public-transport'

# Pinned input URLs. These are the exact snapshots the committed fares were
# generated from; a refresh must fetch these bytes and nothing else.
FILE_URLS = {name: BASE + name for name in FILES}
# SHA-256 manifest for --refresh. It guards against a silent upstream change
# that would otherwise rewrite the committed snapshot with different fares.
FILE_SHA256 = {
    'ROUTE_BUS.mdb': '022948ce381673e8c7031b0bbbd5f1d0a159cb1a2a0cc28196bdaace4f3417ab',
    'ROUTE_GMB.mdb': '64436e3c267ec0dadfe5e7043cb49f5d336dd6fd2c24d89e9f61685c7c73405a',
    'ROUTE_FERRY.mdb': 'b5a08bea391017297a186199c66ddfc079501a93874f435cddc844d78442c73d',
}
USER_AGENT = 'zg852-route-fares-builder/1.0 (build-time open-data snapshot tool)'

# Scoring constants for matching a network line to an TD fare record.
ENDPOINT_SUBSTRING_WEIGHT = 2   # whole endpoint name appearing in the slug
TOKEN_OVERLAP_DIVISOR = 10      # fractional credit per shared word token
MATCH_SCORE_THRESHOLD = 1       # minimum evidence to accept an ambiguous number
# Every fare emitted by this script comes from the TD FULL_FARE snapshot. The
# value is recorded on each line index in a sibling `fareSources` field so the
# app (which reads `fares`) can later distinguish snapshots from band fallbacks
# without a breaking schema change.
FARE_SOURCE = 'td-full-fare'

# LAST_UPDATE_DATE cells are ISO-like strings. Parsing them explicitly replaces
# the old lexicographic max() + [:10] while yielding the same date.
UPDATE_DATE_FORMATS = ('%Y-%m-%d', '%Y-%m-%d %H:%M:%S', '%Y/%m/%d')


def fetch(name, *, refresh):
    """Return the local .mdb path, downloading only for an explicit refresh."""
    filename = f'{name}.mdb'
    path = RAW / filename
    if path.exists() and not refresh:
        return path
    if not refresh:
        raise FileNotFoundError(
            f'{path} is missing; run with --refresh to download the pinned snapshot')
    request = Request(FILE_URLS[filename], headers={'User-Agent': USER_AGENT})
    with urlopen(request, timeout=120) as response:
        payload = response.read()
    digest = hashlib.sha256(payload).hexdigest()
    expected = FILE_SHA256[filename]
    if digest != expected:
        raise ValueError(f'checksum mismatch for {name}: expected {expected}, got {digest}')
    RAW.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return path


def rows(name, *, refresh):
    table = AccessParser(str(fetch(name, refresh=refresh))).parse_table('ROUTE')
    return [
        {key: table[key][i] for key in table}
        for i in range(len(table['ROUTE_ID']))
    ]


def norm(value):
    return re.sub(r'[^a-z0-9]+', '', str(value or '').lower())


def tokens(value):
    return {word for word in re.findall(r'[a-z0-9]+', str(value or '').lower()) if len(word) > 2}


def parse_update_date(value):
    """Parse a LAST_UPDATE_DATE cell into a date for chronological comparison.

    The old exporter kept the lexicographically greatest string and sliced its
    first ten characters. For the ISO-like values actually published this is
    the same as taking the greatest real date; unparseable values are ignored,
    just as non-string values were before.
    """
    if not isinstance(value, str):
        return None
    candidate = value.strip()
    for fmt in UPDATE_DATE_FORMATS:
        try:
            return datetime.strptime(candidate, fmt).date()
        except ValueError:
            pass
    # Tolerate an ISO timestamp with a time/timezone suffix.
    try:
        return datetime.strptime(candidate[:10], '%Y-%m-%d').date()
    except ValueError:
        return None


def endpoint_from_url(url):
    """Extract fare-matching endpoint text from a generated hkbus.app URL.

    Deep links look like
    ``https://hkbus.app/en/route/{route}-{serviceType}-{origin}-{destination}``
    with percent-encoded names. Splitting the slug after ``/route/`` at the
    first two hyphens is the historical behaviour; keep it verbatim so the set
    of selected fares cannot drift.
    """
    try:
        parts = unquote(url.split('/route/', 1)[1]).split('-', 2)
        return parts[2] if len(parts) > 2 else ''
    except (IndexError, ValueError):
        return ''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--refresh', action='store_true',
                      help='download the pinned .mdb snapshots (SHA-256 verified) first')
    mode.add_argument('--offline', action='store_true',
                      help='never download; require local .mdb snapshots (the default)')
    args = parser.parse_args()
    refresh = args.refresh

    bus = defaultdict(list)
    gmb = defaultdict(list)
    ferry = defaultdict(list)
    last_updated = None
    for record in rows('ROUTE_BUS', refresh=refresh):
        fare, updated = record['FULL_FARE'], record.get('LAST_UPDATE_DATE')
        parsed = parse_update_date(updated)
        if parsed is not None and (last_updated is None or parsed > last_updated):
            last_updated = parsed
        if isinstance(fare, (int, float)) and fare > 0:
            bus[str(record['ROUTE_NAMEE']).strip()].append((round(fare / 10000, 2), record))
    for record in rows('ROUTE_GMB', refresh=refresh):
        fare, updated = record['FULL_FARE'], record.get('LAST_UPDATE_DATE')
        parsed = parse_update_date(updated)
        if parsed is not None and (last_updated is None or parsed > last_updated):
            last_updated = parsed
        if isinstance(fare, (int, float)) and fare > 0:
            key = (str(record['DISTRICT']), str(record['ROUTE_NAMEE']).strip())
            gmb[key].append((round(fare / 10000, 2), record))
    for record in rows('ROUTE_FERRY', refresh=refresh):
        fare, updated = record['FULL_FARE'], record.get('LAST_UPDATE_DATE')
        parsed = parse_update_date(updated)
        if parsed is not None and (last_updated is None or parsed > last_updated):
            last_updated = parsed
        if isinstance(fare, (int, float)) and fare > 0:
            entry = (round(fare / 10000, 2), record)
            ferry[str(record['ROUTE_ID'])].append(entry)
            ferry[str(record['ROUTE_NAMEE']).strip()].append(entry)

    network = json.loads((ROOT / 'static' / 'data' / 'network.json').read_text())
    urls = json.loads((ROOT / 'static' / 'data' / 'hkbus.json').read_text())
    fares = {}
    # A network line with no TD fare record at all is data drift, not a line
    # that should silently disappear from the snapshot. Collect them and fail
    # the build so the mismatch is reviewed rather than published as a gap.
    unmatched = []
    for index, line in enumerate(network['lines']):
        if line['c'] not in (1, 2):
            continue
        label = str(line['l'])
        if line['c'] == 1:
            match = re.match(r'^(HKI|KLN|NT)-(.+)$', label)
            candidates = gmb.get((match.group(1), match.group(2)), []) if match else bus.get(label, [])
        else:
            candidates = ferry.get(label) or ferry.get(line.get('n', ''), [])
        if not candidates:
            unmatched.append((index, label))
            continue

        url = urls[index] if index < len(urls) else None
        endpoint_text = endpoint_from_url(url) if url else ''
        if not endpoint_text:
            endpoint_text = line.get('n', '')
        endpoint_norm = norm(endpoint_text)
        endpoint_tokens = tokens(endpoint_text)

        best = None
        for fare, record in candidates:
            start, end = norm(record.get('LOC_START_NAMEE')), norm(record.get('LOC_END_NAMEE'))
            score = ((ENDPOINT_SUBSTRING_WEIGHT if start and start in endpoint_norm else 0)
                     + (ENDPOINT_SUBSTRING_WEIGHT if end and end in endpoint_norm else 0))
            score += len(endpoint_tokens & tokens(record.get('LOC_START_NAMEE'))) / TOKEN_OVERLAP_DIVISOR
            score += len(endpoint_tokens & tokens(record.get('LOC_END_NAMEE'))) / TOKEN_OVERLAP_DIVISOR
            if best is None or score > best[0] or (score == best[0] and fare > best[1]):
                best = (score, fare)
        # An unmatched ambiguous route number is not evidence for any one fare.
        if best and (best[0] >= MATCH_SCORE_THRESHOLD or len({fare for fare, _ in candidates}) == 1):
            fares[str(index)] = best[1]

    if unmatched:
        summary = ', '.join(f'{label} (line {index})' for index, label in unmatched)
        raise SystemExit(f'unmatched route numbers ({len(unmatched)}): {summary}')

    sorted_fares = dict(sorted(fares.items(), key=lambda item: int(item[0])))
    output = {
        'source': {
            'name': 'Transport Department routes and fares of public transport',
            'url': DATASET,
            'files': list(FILES),
            'field': 'FULL_FARE (adult full route fare)',
            'lastUpdated': last_updated.isoformat() if last_updated else '',
            'unit': 'HKD',
        },
        'fares': sorted_fares,
        # Sibling of `fares`: the app consumes `fares`, so adding a key is
        # backward compatible. Each snapshot fare is marked as such; a future
        # band fallback can use a different value without leaving the consumer
        # unable to tell the two apart.
        'fareSources': {key: FARE_SOURCE for key in sorted_fares},
    }
    OUT.write_text(json.dumps(output, separators=(',', ':'), ensure_ascii=False) + '\n')
    print(f'line fares: {len(fares)}; source last updated {output["source"]["lastUpdated"]}')


if __name__ == '__main__':
    main()
