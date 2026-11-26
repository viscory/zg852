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
# Matches the "lat N, lon E" text used by the tourism feed. Named once so the
# sign handling below stays in sync with the format actually published.
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
GOV_SOURCES = (
    ('fehd_rcd_1630036390312_58893', 'fehd_rl', 'food', 'latitude', 'longitude', ('nsearch03_en', 'address_en')),
    ('fehd_rcd_1695972959083_79626', 'fehd_ll', 'drinks', 'latitude', 'longitude', ('nsearch01_en', 'address_en')),
    ('lcsd_rcd_1629267205215_31341', 'sc', 'activities', 'latitude', 'longitude', ('nameen', 'addressen')),
    ('lcsd_rcd_1634540558875_77434', 'sp', 'activities', 'latitude', 'longitude', ('nameen', 'addressen')),
    ('lcsd_rcd_1629267205214_78787', 'museum', 'culture', 'latitude', 'longitude', ('nameen', 'addressen')),
)
# Keyword taxonomies: reviewed mappings from feed vocabulary to our six app
# categories. These are classification rules, not user-facing copy; changing a
# term changes generated POI counts, so keep them together here.
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
# Free-text keyword taxonomy for the tourism feed, checked in insertion order.
ATTRACTION_TERMS = {
    'shopping': ('market', 'shopping', 'bazaar', 'ladies', 'shop'),
    'outdoors': ('park', 'beach', 'harbour', 'waterfront', 'promenade', 'hiking', 'country', 'island', 'peak', 'garden', 'wetland', 'geopark'),
    'culture': ('museum', 'heritage', 'historic', 'temple', 'chapel', 'cultural', 'monument', 'clock tower', 'square'),
    'activities': ('disneyland', 'ocean park', 'theme park', 'tram', 'night', 'entertainment'),
}


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
    basic = properties.get('basic_category') or ''
    if basic in BASIC_CATEGORY:
        return BASIC_CATEGORY[basic]
    for name in (properties.get('taxonomy') or {}).get('hierarchy') or []:
        if name in HIERARCHY_CATEGORY:
            return HIERARCHY_CATEGORY[name]
    return None


def overture_name(properties):
    names = properties.get('names') or {}
    return names.get('primary') or names.get('common') or ''


def attraction_category(row):
    text = f"{row.get('Attraction', '')} {row.get('Description', '')}".lower()
    for category, terms in ATTRACTION_TERMS.items():
        if any(term in text for term in terms):
            return category
    return 'activities'


def parse_tourism_coordinates(value):
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
            lat, lon = parse_tourism_coordinates(row.get('Latitude and longitude coordinates'))
            self.add(lat, lon, attraction_category(row), row.get('Attraction', ''), 'tourism')

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
    # Keep a small in-memory report of unavailable feeds so a partial build is
    # visible at a glance instead of only as scattered SKIP lines. It is logged
    # to stdout only: the generated JSON schema/ordering is left untouched.
    missing_feeds_report = []
    for dataset, table, category, lat_key, lon_key, name_keys in GOV_SOURCES:
        try:
            fields = [lat_key, lon_key, *name_keys]
            rows = fetch_pgrst(dataset, table, fields)
        except requests.RequestException as error:
            print(f'SKIP {table}: {error}')
            missing_feeds_report.append({'feed': table, 'reason': str(error)})
            continue
        index.add_rows(rows, category, lat_key, lon_key, name_keys, table)
        print(f'{table}: {len(rows)}')
    visitor_url = 'https://www.afcd.gov.hk/data/AFCD_Visitor_Centre_en.csv'
    try:
        visitor_rows = list(csv.DictReader(io.StringIO(requests.get(visitor_url, timeout=60).text)))
        index.add_rows(visitor_rows, 'outdoors', 'Latitude Decimal Degree(DD.DDD)', 'Longitude Decimal Degree(DD.DDD)', ('Name of Building/Facility',), 'afcd')
        print(f'afcd visitor centres: {len(visitor_rows)}')
    except requests.RequestException as error:
        print(f'SKIP afcd: {error}')
        missing_feeds_report.append({'feed': 'afcd', 'reason': str(error)})
    tourism_url = 'https://www.tourism.gov.hk/datagovhk/major_attractions/major_attractions_info_en.csv'
    try:
        tourism_rows = list(csv.DictReader(io.StringIO(requests.get(tourism_url, timeout=60).text)))
        index.add_tourism(tourism_rows)
        print(f'major attractions: {len(tourism_rows)}')
    except requests.RequestException as error:
        print(f'SKIP tourism: {error}')
        missing_feeds_report.append({'feed': 'tourism', 'reason': str(error)})
    if missing_feeds_report:
        summary = ', '.join(f"{item['feed']} ({item['reason']})" for item in missing_feeds_report)
        print(f'missing feeds report: {len(missing_feeds_report)} unavailable -> {summary}')
    else:
        print('missing feeds report: none')
    if args.overture:
        index.add_overture(args.overture)
        print('overture: loaded')
    result = index.build()
    with open(args.output, 'w', encoding='utf-8') as handle:
        json.dump(result, handle, ensure_ascii=False, separators=(',', ':'))
    print(f'{args.output}: {len(result["cells"])} cells, {sum(result["totals"].values())} points')


if __name__ == '__main__':
    main()
