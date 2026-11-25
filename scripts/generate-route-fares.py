#!/usr/bin/env python3
"""Regenerate static/data/route-fares.json from Transport Department open data.

The GTFS feed has no fare_attributes.txt, so distance bands cannot produce
honest bus fares. This script snapshots the Transport Department's adult full
route fares and attaches them to the bundled network line indexes.

Build-time dependency: pip install access_parser
"""

from access_parser import AccessParser
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote
from urllib.request import Request, urlopen
import json
import re

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'static' / 'data' / 'raw'
OUT = ROOT / 'static' / 'data' / 'route-fares.json'
BASE = 'https://static.data.gov.hk/td/routes-and-fares/'
FILES = ('ROUTE_BUS.mdb', 'ROUTE_GMB.mdb', 'ROUTE_FERRY.mdb')
DATASET = 'https://data.gov.hk/en-data/dataset/hk-td-tis_3-routes-and-fares-of-public-transport'


def fetch(name):
    path = RAW / f'{name}.mdb'
    if not path.exists():
        request = Request(BASE + path.name, headers={'User-Agent': 'curl/8.0'})
        with urlopen(request) as response:
            path.write_bytes(response.read())
    return path


def rows(name):
    table = AccessParser(str(fetch(name))).parse_table('ROUTE')
    return [
        {key: table[key][i] for key in table}
        for i in range(len(table['ROUTE_ID']))
    ]


def norm(value):
    return re.sub(r'[^a-z0-9]+', '', str(value or '').lower())


def tokens(value):
    return {word for word in re.findall(r'[a-z0-9]+', str(value or '').lower()) if len(word) > 2}


def main():
    bus = defaultdict(list)
    gmb = defaultdict(list)
    ferry = defaultdict(list)
    last_updated = ''
    for record in rows('ROUTE_BUS'):
        fare, updated = record['FULL_FARE'], record.get('LAST_UPDATE_DATE')
        if isinstance(updated, str):
            last_updated = max(last_updated, updated)
        if isinstance(fare, (int, float)) and fare > 0:
            bus[str(record['ROUTE_NAMEE']).strip()].append((round(fare / 10000, 2), record))
    for record in rows('ROUTE_GMB'):
        fare, updated = record['FULL_FARE'], record.get('LAST_UPDATE_DATE')
        if isinstance(updated, str):
            last_updated = max(last_updated, updated)
        if isinstance(fare, (int, float)) and fare > 0:
            key = (str(record['DISTRICT']), str(record['ROUTE_NAMEE']).strip())
            gmb[key].append((round(fare / 10000, 2), record))
    for record in rows('ROUTE_FERRY'):
        fare, updated = record['FULL_FARE'], record.get('LAST_UPDATE_DATE')
        if isinstance(updated, str):
            last_updated = max(last_updated, updated)
        if isinstance(fare, (int, float)) and fare > 0:
            entry = (round(fare / 10000, 2), record)
            ferry[str(record['ROUTE_ID'])].append(entry)
            ferry[str(record['ROUTE_NAMEE']).strip()].append(entry)

    network = json.loads((ROOT / 'static' / 'data' / 'network.json').read_text())
    urls = json.loads((ROOT / 'static' / 'data' / 'hkbus.json').read_text())
    fares = {}
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
            continue

        endpoint_text = ''
        url = urls[index] if index < len(urls) else None
        if url:
            try:
                parts = unquote(url.split('/route/', 1)[1]).split('-', 2)
                endpoint_text = parts[2] if len(parts) > 2 else ''
            except (IndexError, ValueError):
                endpoint_text = ''
        if not endpoint_text:
            endpoint_text = line.get('n', '')
        endpoint_norm = norm(endpoint_text)
        endpoint_tokens = tokens(endpoint_text)

        best = None
        for fare, record in candidates:
            start, end = norm(record.get('LOC_START_NAMEE')), norm(record.get('LOC_END_NAMEE'))
            score = (2 if start and start in endpoint_norm else 0) + (2 if end and end in endpoint_norm else 0)
            score += len(endpoint_tokens & tokens(record.get('LOC_START_NAMEE'))) / 10
            score += len(endpoint_tokens & tokens(record.get('LOC_END_NAMEE'))) / 10
            if best is None or score > best[0] or (score == best[0] and fare > best[1]):
                best = (score, fare)
        # An unmatched ambiguous route number is not evidence for any one fare.
        if best and (best[0] >= 1 or len({fare for fare, _ in candidates}) == 1):
            fares[str(index)] = best[1]

    output = {
        'source': {
            'name': 'Transport Department routes and fares of public transport',
            'url': DATASET,
            'files': list(FILES),
            'field': 'FULL_FARE (adult full route fare)',
            'lastUpdated': last_updated[:10],
            'unit': 'HKD',
        },
        'fares': dict(sorted(fares.items(), key=lambda item: int(item[0]))),
    }
    OUT.write_text(json.dumps(output, separators=(',', ':'), ensure_ascii=False) + '\n')
    print(f'line fares: {len(fares)}; source last updated {output["source"]["lastUpdated"]}')


if __name__ == '__main__':
    main()
