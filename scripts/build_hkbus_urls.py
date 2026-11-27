#!/usr/bin/env python3
"""Build a static map from our bus line objects to hkbus.app route pages.

hkbus.app deep links are full slugs of the shape
``/en/route/{route}-{serviceType}-{origin}-{destination}``; a bare route
number is not a valid page. Candidate slugs come from the hk-bus-crawling
``routeList`` feed, but a page is chosen by scoring the similarity of its
endpoint names to the line's origin/destination: there is no stable route
identifier linking our lines to hkbus.app pages.

This is a maintenance tool, not part of the normal Vite build: the generated
``static/data/hkbus.json`` is committed so the app never needs a network call
at build or run time. A parallel ``static/data/hkbus-meta.json`` records an
explicit status for every line index, with the same generic ``no-deep-link``
reason for every fallback, so a fallback to in-app search is never confused
with a real deep link. Re-run both whenever the GTFS feed is refreshed.

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
# Identify this one-off build tool honestly instead of pretending to be a
# browser; the upstream feed does not require a UA spoof to serve its JSON.
USER_AGENT = "zg852-hkbus-url-builder/1.0 (+https://github.com/viscory/zg852)"

# Route matching: origin and destination similarity carry equal weight. The
# integer weights keep the arithmetic bit-for-bit identical to the original
# (origin_ratio + destination_ratio) / 2 expression.
ORIGIN_MATCH_WEIGHT = 1
DESTINATION_MATCH_WEIGHT = 1
ROUTE_SCORE_DIVISOR = ORIGIN_MATCH_WEIGHT + DESTINATION_MATCH_WEIGHT
# A deep link is offered only with this much endpoint evidence. A low-scoring
# candidate is not a "closest match" at all, so the generic search is used.
ROUTE_SCORE_THRESHOLD = 0.5

# hkbus.app publishes sitemap entries for keys containing a fullwidth slash but
# the pre-rendered pages 404. This is only a detection character: it decides
# whether a candidate slug is usable. The shipped metadata does not record
# which of the two fallback cases applied, only the generic no-deep-link reason.
FULLWIDTH_SLASH_CHAR = "／"


def normalise(text):
    return re.sub(r"[^a-z0-9]", "", str(text).lower())


def route_number(label):
    number = re.sub(r"^[A-Z]{2,4}-", "", label)
    return re.sub(r"[^A-Z0-9]", "", number.upper())


def hkbus_slug(key):
    parts = key.split("+")
    return "-".join(urllib.parse.quote(part.lower().replace(" ", "-"), safe="-") for part in parts)


def score_route_match(line, index, route_list):
    """Pick a routeList key by endpoint-name similarity scoring, not identity."""
    candidates = index.get(route_number(line["l"]), [])
    if not candidates:
        return None
    bits = line.get("n", "").split(" - ", 1)
    if len(bits) != 2:
        # No endpoint pair to score. Only a single candidate is unambiguous;
        # otherwise picking candidates[0] would offer an unrelated route page.
        return candidates[0] if len(candidates) == 1 else None
    origin, destination = bits
    best, best_score = None, -1
    for key in candidates:
        entry = route_list[key]
        src = entry.get("orig", {}).get("en", "")
        dst = entry.get("dest", {}).get("en", "")
        for a, b in ((src, dst), (dst, src)):
            origin_ratio = difflib.SequenceMatcher(None, normalise(origin), normalise(a)).ratio()
            destination_ratio = difflib.SequenceMatcher(None, normalise(destination), normalise(b)).ratio()
            score = (ORIGIN_MATCH_WEIGHT * origin_ratio
                     + DESTINATION_MATCH_WEIGHT * destination_ratio) / ROUTE_SCORE_DIVISOR
            if score > best_score:
                best, best_score = key, score
    return best if best_score >= ROUTE_SCORE_THRESHOLD else None


def route_url(key):
    """Return the deep link for a route key, or None when no page exists.

    A None key means no candidate matched; a key containing FULLWIDTH_SLASH_CHAR
    is published in the sitemap but its page 404s. Both cases are represented
    identically as "no deep link" here rather than being silently redirected.
    The caller maps None to the in-app search URL so the generated list keeps
    its historical values, and records the same generic reason in both cases:
    the specific cause is not recoverable from the shipped metadata.
    """
    if not key or FULLWIDTH_SLASH_CHAR in key:
        return None
    return f"https://hkbus.app/en/route/{hkbus_slug(key)}"


def main():
    request = urllib.request.Request(ROUTE_LIST_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        route_list = json.load(response)["routeList"]

    index = {}
    for key, entry in route_list.items():
        index.setdefault(route_number(str(entry.get("route", ""))), []).append(key)

    with open(os.path.join(DATA, "network.json"), encoding="utf-8") as fh:
        lines = json.load(fh)["lines"]

    urls = []
    # Parallel per-index metadata: the app keeps the historical hkbus.json array
    # shape, but a reader can tell a real deep link from a deliberate fallback.
    meta = []
    matched = 0
    skipped_fullwidth = 0
    unmatched = 0
    for line in lines:
        if line["c"] != 1:
            urls.append(None)
            meta.append({"status": "not-a-bus-line"})
            continue
        key = score_route_match(line, index, route_list)
        url = route_url(key)
        if url is None:
            # Record the two fallback causes distinctly: no candidate key vs. a
            # sitemap key whose page 404s.
            # The shipped hkbus-meta.json was produced by the older generic-reason version and gains these reasons on the next regeneration.
            if not key:
                unmatched += 1
                meta.append({"status": "fallback", "reason": "no-matching-key"})
            else:
                skipped_fullwidth += 1
                print(f"SKIP {line['l']}: hkbus.app page 404s for fullwidth-slash key {key!r}; using in-app search")
                meta.append({"status": "fallback", "reason": "page-404"})
            urls.append(SEARCH_URL)
        else:
            matched += 1
            urls.append(url)
            meta.append({"status": "ok"})

    path = os.path.join(DATA, "hkbus.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(urls, fh, separators=(",", ":"))
    meta_path = os.path.join(DATA, "hkbus-meta.json")
    with open(meta_path, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, separators=(",", ":"))

    print(f"bus lines matched={matched}/{sum(1 for line in lines if line['c'] == 1)} "
          f"skipped_fullwidth={skipped_fullwidth} unmatched={unmatched} "
          f"file={os.path.getsize(path)/1e3:.0f}KB meta={os.path.getsize(meta_path)/1e3:.0f}KB")


if __name__ == "__main__":
    main()
