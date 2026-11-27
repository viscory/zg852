#!/usr/bin/env python3
"""Read-only sanity check of the shipped 就腳 transit graph.

Run from the repo root. Prints an ISSUE line for every finding and an
ISSUE_COUNT derived from all of them, then exits 1 if any issue was found
(0 otherwise). It never writes to the graph or the repository.
"""
import json
import math
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
DATA = os.path.join(ROOT, "static", "data")

KNOWN = {
    "Central": (22.2819, 114.1577),
    "Admiralty": (22.2794, 114.1646),
    "Tsim Sha Tsui": (22.2976, 114.1722),
    "Mong Kok": (22.3193, 114.1694),
    "Kowloon Tong": (22.3369, 114.1762),
    "Sha Tin": (22.3820, 114.1877),
    "Airport": (22.3157, 113.9365),
    "Tsing Yi": (22.3586, 114.1072),
    "North Point": (22.2913, 114.2003),
    "Tsuen Wan": (22.3736, 114.1178),
    "Kennedy Town": (22.2813, 114.1288),
    "Shau Kei Wan": (22.2776, 114.2289),
}


def hav(a, b):
    r = math.radians
    dlat, dlon = r(b[0] - a[0]), r(b[1] - a[1])
    h = math.sin(dlat / 2) ** 2 + math.cos(r(a[0])) * math.cos(r(b[0])) * math.sin(dlon / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def stop_name(name):
    for sep in (" · Platform ", " · Exit "):
        if sep in name:
            return name.split(sep)[0]
    return name


def main():
    issues = 0
    nodes_path = os.path.join(DATA, "nodes.json")
    net_path = os.path.join(DATA, "network.json")
    if not os.path.exists(nodes_path) or not os.path.exists(net_path):
        print("ISSUE missing nodes.json or network.json under static/data")
        issues += 1
        print("ISSUE_COUNT", issues)
        return issues
    nodes = json.load(open(nodes_path, encoding="utf-8"))
    net = json.load(open(net_path, encoding="utf-8"))
    report_path = os.path.join(DATA, "build-report.json")
    if not os.path.exists(report_path):
        print("ISSUE missing build-report.json provenance")
        issues += 1
    else:
        report = json.load(open(report_path, encoding="utf-8"))
        counts = report.get("counts", {})
        if report.get("policy") != "no-drop":
            print("ISSUE build-report policy is not no-drop")
            issues += 1
        for key in ("droppedEdges", "skippedTrips", "unresolvableStops"):
            if counts.get(key, 0) > 0:
                print(f"ISSUE build-report records {key}={counts[key]}")
                issues += 1
        if counts.get("lines") != len(net["lines"]) or counts.get("walkEdges") != len(net["walk"]):
            print("ISSUE build-report counts disagree with network.json")
            issues += 1
    names, lats, lons, kinds = nodes["names"], nodes["lat"], nodes["lon"], nodes["kind"]

    stations = {}
    for i, name in enumerate(names):
        if kinds[i] == 1:
            stations.setdefault(name, []).append(i)
    for name, coord in KNOWN.items():
        idxs = stations.get(name, [])
        if not idxs:
            print(f"ISSUE missing station node {name}")
            issues += 1
            continue
        err = min(hav((lats[i], lons[i]), coord) for i in idxs)
        if err > 400:
            print(f"ISSUE {name} is {err:.0f} m from the known position")
            issues += 1

    def hop(i, j):
        return hav((lats[i], lons[i]), (lats[j], lons[j]))

    for ln in net["lines"]:
        stops, edges = ln["s"], ln["e"]
        if len(edges) != len(stops) - 1:
            print(f"ISSUE {ln['l']} has {len(stops)} stops and {len(edges)} edges")
            issues += 1
            continue
        for i, dt in enumerate(edges):
            dist = hop(stops[i], stops[i + 1])
            a, b = stop_name(names[stops[i]]), stop_name(names[stops[i + 1]])
            if ln["c"] == 0 and {a, b} == {"Airport", "Tsing Yi"} and dt > 16:
                print(f"ISSUE AEL {a} -> {b} is {dt} min over {dist:.0f} m")
                issues += 1
            if ln["c"] == 0 and dist > 3000:
                synthetic = dist / 1000 / 45 * 60
                if abs(dt - synthetic) < 0.4:
                    print(f"ISSUE rail hop matches 45 km/h: {ln['l']} {a} -> {b} {dt} min {dist:.0f} m")
                    issues += 1
            if dist < 800 and dt >= 15:
                print(f"ISSUE short hop {ln['l']} {a} -> {b} {dt} min for {dist:.0f} m")
                issues += 1
        if ln["c"] == 1 and any(token in ln["l"].upper() for token in ("FERRY",)):
            print(f"ISSUE ferry stored as bus: {ln['l']}")
            issues += 1

    codes = {}
    for ln in net["lines"]:
        codes[ln["c"]] = codes.get(ln["c"], 0) + 1
    print(f"lines_by_c {codes}")
    if 2 not in codes and 3 not in codes:
        print("NOTE no ferry (c 2) or light rail (c 3) category. Non-MTR agencies may all be bus.")
    print("ISSUE_COUNT", issues)
    return issues


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
