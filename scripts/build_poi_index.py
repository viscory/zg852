"""Build the cell-based POI index from structured feed fields.

Categories are never guessed from description prose: government feeds carry a
fixed category per feed, Overture carries taxonomy fields, and the tourism feed
uses exact-name overrides reviewed below. Tourism rows without a reviewed
category are counted and fail the build past the reviewed threshold; so do
unreadable coordinates and missing required feeds.
"""

import argparse
import csv
import datetime
import io
import json
import math
import os
import re

import requests

CELL_SIZE = 0.005
# Pagination page size for the PostgREST feeds. Also the threshold that marks
# a short (final) page when the server does not report a total count.
PAGE_SIZE = 100
# The tourism feed has no numeric lat/lon columns: its only coordinate data is
# the "lat N, lon E" string in one field. Parse that field explicitly (see
# parse_tourism_coordinates) and count failures instead of silently dropping
# rows whose prose does not match.
TOURISM_COORDINATE_RE = re.compile(r'(\d+\.\d+)\s*([NS])\s*,\s*(\d+\.\d+)\s*([EW])', re.I)
BBOX = (113.83, 22.15, 114.45, 22.58)
CATEGORIES = ('food', 'drinks', 'activities', 'culture', 'outdoors', 'shopping')
PGRST = 'https://pgrst.open-data.hk'
SOURCES = (
    'https://open-data.hk/csdi-datasets/fehd_rcd_1630036390312_58893',
    'https://open-data.hk/csdi-datasets/fehd_rcd_1695972959083_79626',
    'https://open-data.hk/csdi-datasets/lcsd_rcd_1629267205215_31341',
    'https://open-data.hk/csdi-datasets/lcsd_rcd_1634540558875_77434',
    'https://open-data.hk/csdi-datasets/lcsd_rcd_1629267205214_78787',
    'https://www.afcd.gov.hk/data/AFCD_Visitor_Centre_en.csv',
    'https://www.tourism.gov.hk/datagovhk/major_attractions/major_attractions_info_en.csv',
    'https://overturemaps.org/',
)
# (dataset, table, lat field, lon field, name fields). The category is not part
# of the feed row: it comes from the structured feed identity via
# CATEGORY_BY_SOURCE_FIELD below.
GOV_SOURCES = (
    ('fehd_rcd_1630036390312_58893', 'fehd_rl', 'latitude', 'longitude', ('nsearch03_en', 'address_en')),
    ('fehd_rcd_1695972959083_79626', 'fehd_ll', 'latitude', 'longitude', ('nsearch01_en', 'address_en')),
    ('lcsd_rcd_1629267205215_31341', 'sc', 'latitude', 'longitude', ('nameen', 'addressen')),
    ('lcsd_rcd_1634540558875_77434', 'sp', 'latitude', 'longitude', ('nameen', 'addressen')),
    ('lcsd_rcd_1629267205214_78787', 'museum', 'latitude', 'longitude', ('nameen', 'addressen')),
)
# Structured Overture field values reviewed against our six app categories.
# These are classification rules, not user-facing copy; changing a value changes
# generated POI counts, so keep them together here.
BASIC_CATEGORY = {
    'restaurant': 'food',
    'cafe': 'food',
    'coffee_shop': 'food',
    'fast_food_restaurant': 'food',
    'casual_eatery': 'food',
    'food_and_drink': 'food',
    'bar': 'drinks',
    'nightlife_venue': 'drinks',
    'winery': 'drinks',
    'museum': 'culture',
    'art_gallery': 'culture',
    'historic_site': 'culture',
    'performing_arts_venue': 'culture',
    'theatre_venue': 'culture',
    'cultural_center': 'culture',
    'park': 'outdoors',
    'national_park': 'outdoors',
    'beach': 'outdoors',
    'mountain': 'outdoors',
    'garden': 'outdoors',
    'recreational_trail_or_path': 'outdoors',
    'public_plaza': 'outdoors',
}
HIERARCHY_CATEGORY = {
    'shopping': 'shopping',
    'sports_and_recreation': 'activities',
    'arts_and_entertainment': 'activities',
    'cultural_and_historic': 'culture',
    'geographic_entities': 'outdoors',
}
# CATEGORY_BY_SOURCE_FIELD is the single structured mapping used by the build:
# government feeds have one reviewed category per feed identity (table), and
# Overture has two reviewed taxonomy fields (value maps above). Nothing here
# inspects description prose. A source/value absent from this map is not
# silently bucketed: it is reported by the build (see uncategorised handling).
CATEGORY_BY_SOURCE_FIELD = {
    'fehd_rl': 'food',
    'fehd_ll': 'drinks',
    'sc': 'activities',
    'sp': 'activities',
    'museum': 'culture',
    'afcd': 'outdoors',
    'overture:basic_category': BASIC_CATEGORY,
    'overture:taxonomy.hierarchy': HIERARCHY_CATEGORY,
}

# The tourism CSV has no category column. Each attraction below is keyed by its
# exact published name, reviewed individually; no keyword/substring matching is
# used. New or renamed attractions must be added here after review, otherwise
# they are recorded as category: null and counted by the build report.
TOURISM_CATEGORY_OVERRIDES = {
    'Avenue of Stars': 'activities',
    'Clock Tower': 'culture',
    'Golden Bauhinia Square (and Hong Kong Convention and Exhibition Centre)': 'culture',
    'Hong Kong Disneyland Resort': 'activities',
    "Ladies' Market": 'shopping',
    'Lan Kwai Fong': 'activities',
    'Ocean Park Hong Kong': 'outdoors',
    'Temple Street Night Market': 'shopping',
    'The Peak': 'outdoors',
    'Tsim Sha Tsui Promenade': 'outdoors',
    'Yim Tin Tsai': 'activities',
}
# Reviewed baseline: every attraction currently in the tourism feed has an
# explicit override above, so zero uncategorised rows is the expected state.
MAX_UNCATEGORISED_ROWS = 0


def floats(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def in_bounds(lat, lon):
    return lat is not None and lon is not None and BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]


def cell_key(lat, lon):
    return f'{math.floor(lat / CELL_SIZE)},{math.floor(lon / CELL_SIZE)}'


def first_value(row, keys):
    for key in keys:
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ''


def fetch_pgrst(dataset, table, fields):
    rows = []
    offset = 0
    total = None
    while total is None or offset < total:
        response = requests.get(
            f'{PGRST}/{table}',
            params={'select': ','.join(fields), 'limit': PAGE_SIZE, 'offset': offset},
            headers={'Accept-Profile': f'csdi_{dataset}', 'Prefer': 'count=exact'},
            timeout=90,
        )
        response.raise_for_status()
        page = response.json()
        rows.extend(page)
        content_range = response.headers.get('content-range', '')
        if '/' in content_range:
            total = int(content_range.rsplit('/', 1)[1])
        offset += len(page)
        # `and` binds tighter than `or`; make the short-page guard explicit so
        # pagination only stops early when the server gave no total count.
        if not page or (total is None and len(page) < PAGE_SIZE):
            break
    return rows


def overture_category(properties):
    """Read the two structured Overture taxonomy fields via the shared map."""
    basic_map = CATEGORY_BY_SOURCE_FIELD['overture:basic_category']
    hierarchy_map = CATEGORY_BY_SOURCE_FIELD['overture:taxonomy.hierarchy']
    basic = properties.get('basic_category') or ''
    if basic in basic_map:
        return basic_map[basic]
    for name in (properties.get('taxonomy') or {}).get('hierarchy') or []:
        if name in hierarchy_map:
            return hierarchy_map[name]
    return None


def overture_name(properties):
    names = properties.get('names') or {}
    return names.get('primary') or names.get('common') or ''


def attraction_category(row):
    """Categorise an attraction by exact published name, never by prose terms."""
    return TOURISM_CATEGORY_OVERRIDES.get(row.get('Attraction', ''))


def parse_tourism_coordinates(value):
    """Parse the tourism feed's "lat N, lon E" prose field (a known fragility, since no numeric columns exist; non-matches are counted and fail the build rather than silently dropping the attraction)."""
    match = TOURISM_COORDINATE_RE.search(value or '')
    if not match:
        return None, None
    lat = float(match.group(1)) * (1 if match.group(2).upper() == 'N' else -1)
    lon = float(match.group(3)) * (1 if match.group(4).upper() == 'E' else -1)
    return lat, lon


class Index:
    def __init__(self):
        self.cells = {}
        self.maxima = {category: 0 for category in CATEGORIES}
        self.totals = {category: 0 for category in CATEGORIES}
        # Build report counters: rows we deliberately do NOT index because a
        # structured category or coordinate was missing. Both fail the build.
        self.uncategorised = []
        self.coordinate_failures = []

    def add(self, lat, lon, category, name, source):
        lat, lon = floats(lat), floats(lon)
        if category not in CATEGORIES or not in_bounds(lat, lon):
            return
        key = cell_key(lat, lon)
        cell = self.cells.setdefault(key, {'v': {}, 'n': {}, 'top': {}})
        counts = cell['n']
        counts[category] = counts.get(category, 0) + 1
        self.maxima[category] = max(self.maxima[category], counts[category])
        self.totals[category] += 1
        if name:
            top = cell['top'].setdefault(category, [])
            label = f'{name} ({source})'
            if label not in top and len(top) < 3:
                top.append(label)

    def add_rows(self, rows, category, lat_key, lon_key, name_keys, source):
        for row in rows:
            self.add(row.get(lat_key), row.get(lon_key), category, first_value(row, name_keys), source)

    def add_overture(self, path):
        with open(path, encoding='utf-8') as handle:
            for line in handle:
                if not line.strip():
                    continue
                feature = json.loads(line)
                properties = feature.get('properties') or {}
                category = overture_category(properties)
                if not category:
                    # Not a POI in our six-category taxonomy. This is an
                    # explicit exclusion, not an uncategorised POI row.
                    continue
                geometry = feature.get('geometry') or {}
                # Only Point features carry a [lon, lat] pair we can swap.
                # Skipping other geometry types explicitly avoids treating a
                # line/polygon coordinate as a place location.
                if geometry.get('type') != 'Point':
                    continue
                coordinates = geometry.get('coordinates') or []
                if len(coordinates) < 2:
                    continue
                # Overture GeoJSON Point coordinates are [lon, lat]; the index
                # stores (lat, lon), hence the swap below.
                self.add(coordinates[1], coordinates[0], category, overture_name(properties), 'overture')

    def add_tourism(self, rows):
        for row in rows:
            name = row.get('Attraction', '')
            lat, lon = parse_tourism_coordinates(row.get('Latitude and longitude coordinates'))
            if lat is None or lon is None:
                self.coordinate_failures.append(name)
                continue
            category = attraction_category(row)
            if category is None:
                # No reviewed exact-name override: record category: null in the
                # build report instead of guessing from the description.
                self.uncategorised.append(name)
                continue
            self.add(lat, lon, category, name, 'tourism')

    def build(self):
        for key, cell in self.cells.items():
            values = {}
            for category in CATEGORIES:
                count = cell['n'].get(category, 0)
                maximum = max(1, self.maxima[category])
                values[category] = round(min(1, math.log1p(count) / math.log1p(maximum)), 4) if count else 0
            cell['v'] = values
        return {
            'version': 1,
            'generated': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
            'cellSize': CELL_SIZE,
            'categories': list(CATEGORIES),
            'normalization': 'per-category log1p',
            'sources': list(SOURCES),
            'totals': self.totals,
            'cells': dict(sorted(self.cells.items())),
        }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--overture')
    parser.add_argument('--output', default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'static', 'data', 'poi-index.json'))
    args = parser.parse_args()
    index = Index()
    # Every source here is required: a partial index must never be published.
    # Collect all failures first so one run reports all of them, then fail the
    # build with a non-zero exit instead of printing a cosmetic report.
    failed_feeds = []
    for dataset, table, lat_key, lon_key, name_keys in GOV_SOURCES:
        try:
            fields = [lat_key, lon_key, *name_keys]
            rows = fetch_pgrst(dataset, table, fields)
        except requests.RequestException as error:
            print(f'SKIP {table}: {error}')
            failed_feeds.append({'feed': table, 'reason': str(error)})
            continue
        index.add_rows(rows, CATEGORY_BY_SOURCE_FIELD[table], lat_key, lon_key, name_keys, table)
        print(f'{table}: {len(rows)}')
    visitor_url = 'https://www.afcd.gov.hk/data/AFCD_Visitor_Centre_en.csv'
    try:
        visitor_rows = list(csv.DictReader(io.StringIO(requests.get(visitor_url, timeout=60).text)))
        index.add_rows(visitor_rows, CATEGORY_BY_SOURCE_FIELD['afcd'], 'Latitude Decimal Degree(DD.DDD)', 'Longitude Decimal Degree(DD.DDD)', ('Name of Building/Facility',), 'afcd')
        print(f'afcd visitor centres: {len(visitor_rows)}')
    except requests.RequestException as error:
        print(f'SKIP afcd: {error}')
        failed_feeds.append({'feed': 'afcd', 'reason': str(error)})
    tourism_url = 'https://www.tourism.gov.hk/datagovhk/major_attractions/major_attractions_info_en.csv'
    try:
        tourism_rows = list(csv.DictReader(io.StringIO(requests.get(tourism_url, timeout=60).text)))
        index.add_tourism(tourism_rows)
        print(f'major attractions: {len(tourism_rows)}')
    except requests.RequestException as error:
        print(f'SKIP tourism: {error}')
        failed_feeds.append({'feed': 'tourism', 'reason': str(error)})
    if failed_feeds:
        summary = ', '.join(f"{item['feed']} ({item['reason']})" for item in failed_feeds)
        raise SystemExit(f'required feeds unavailable ({len(failed_feeds)}): {summary}')
    if index.coordinate_failures:
        names = ', '.join(index.coordinate_failures)
        raise SystemExit(f'tourism coordinate parse failures ({len(index.coordinate_failures)}): {names}')
    if len(index.uncategorised) > MAX_UNCATEGORISED_ROWS:
        names = ', '.join(index.uncategorised)
        raise SystemExit(f'uncategorised tourism attractions ({len(index.uncategorised)} > {MAX_UNCATEGORISED_ROWS}): {names}')
    if args.overture:
        index.add_overture(args.overture)
        print('overture: loaded')
    result = index.build()
    with open(args.output, 'w', encoding='utf-8') as handle:
        json.dump(result, handle, ensure_ascii=False, separators=(',', ':'))
    print(f'{args.output}: {len(result["cells"])} cells, {sum(result["totals"].values())} points')


if __name__ == '__main__':
    main()
