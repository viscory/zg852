#!/usr/bin/env python3
"""Build a static map from our bus line objects to hkbus.app route pages.

hkbus.app deep links are full slugs of the shape
``/en/route/{route}-{serviceType}-{origin}-{destination}``; a bare route
number is not a valid page. The authoritative slugs are derived from the
hk-bus-crawling ``routeList`` keys, which are available as a public JSON feed.

This is a maintenance tool, not part of the normal Vite build: the generated
``static/data/hkbus.json`` is committed so the app never needs a network call
at build or run time. Re-run it whenever the GTFS feed is refreshed.

Usage: python3 scripts/build_hkbus_urls.py
"""

import difflib
import json
import os
import re
import urllib.parse
import urllib.request

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "static", "data")
ROUTE_LIST_URL = "https://hkbus.github.io/hk-bus-crawling/routeFareList.min.json"
SEARCH_URL = "https://hkbus.app/en/search"


def normalise(text):
    return re.sub(r"[^a-z0-9]", "", str(text).lower())


def route_number(label):
    number = re.sub(r"^[A-Z]{2,4}-", "", label)
    return re.sub(r"[^A-Z0-9]", "", number.upper())


def hkbus_slug(key):
    parts = key.split("+")
    return "-".join(urllib.parse.quote(part.lower().replace(" ", "-"), safe="-") for part in parts)


def match_route(line, index, route_list):
    candidates = index.get(route_number(line["l"]), [])
    if not candidates:
        return None
    bits = line.get("n", "").split(" - ", 1)
    if len(bits) != 2:
        return candidates[0]
    origin, destination = bits
    best, best_score = None, -1
    for key in candidates:
        entry = route_list[key]
        src = entry.get("orig", {}).get("en", "")
        dst = entry.get("dest", {}).get("en", "")
        for a, b in ((src, dst), (dst, src)):
            score = (difflib.SequenceMatcher(None, normalise(origin), normalise(a)).ratio()
                     + difflib.SequenceMatcher(None, normalise(destination), normalise(b)).ratio()) / 2
            if score > best_score:
                best, best_score = key, score
    return best


def main():
    request = urllib.request.Request(ROUTE_LIST_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        route_list = json.load(response)["routeList"]

    index = {}
    for key, entry in route_list.items():
        index.setdefault(route_number(str(entry.get("route", ""))), []).append(key)

    with open(os.path.join(DATA, "network.json"), encoding="utf-8") as fh:
        lines = json.load(fh)["lines"]

    urls = []
    matched = 0
    for line in lines:
        if line["c"] != 1:
            urls.append(None)
            continue
        key = match_route(line, index, route_list)
        # hkbus.app publishes sitemap entries for names containing a fullwidth
        # slash, but the pre-rendered pages themselves 404. Send those to the
        # in-app search instead of handing the user a dead link.
        if key and "／" not in key:
            matched += 1
            urls.append(f"https://hkbus.app/en/route/{hkbus_slug(key)}")
        else:
            urls.append(SEARCH_URL)

    path = os.path.join(DATA, "hkbus.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(urls, fh, separators=(",", ":"))

    print(f"bus lines matched={matched}/{sum(1 for line in lines if line['c'] == 1)} "
          f"file={os.path.getsize(path)/1e3:.0f}KB")


if __name__ == "__main__":
    main()
