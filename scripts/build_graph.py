#!/usr/bin/env python3
"""Build a compact HK graph with MTR platforms, exits, transfers and bus stops."""

import csv
import json
import math
import os
import statistics
import zipfile
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "static", "data")
RAW = os.path.join(DATA, "raw")
FEED = os.path.join(RAW, "hk-community-gtfs.zip")
OUT = os.path.join(DATA, "graph.json")


WALK_SPEED_KMH = 4.5
WALK_DETOUR = 1.3
WALK_RADIUS_M = 400
WALK_NEIGHBOURS = 6
MAX_WAIT_MIN = 20.0
BOARD_PENALTY = {"rail": 1.0, "bus": 2.0, "ferry": 2.0, "lightRail": 1.0}
CAT_CODE = {"rail": 0, "bus": 1, "ferry": 2, "lightRail": 3}

BIG_INTERCHANGES = {"ADM": 2.0, "CEN": 1.5, "MOK": 1.0, "KOT": 1.0, "TSY": 0.5, "TAW": 0.5}


def to_minutes(text):
    if not text:
        return None
    parts = text.split(":")
    return int(parts[0]) * 60 + int(parts[1]) + int(parts[2]) / 60


def haversine(a, b):
    lat1, lon1 = math.radians(a["lat"]), math.radians(a["lon"])
    lat2, lon2 = math.radians(b["lat"]), math.radians(b["lon"])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def read_table(zf, name):
    with zf.open(name) as fh:
        yield from csv.DictReader(line.decode("utf-8-sig") for line in fh)


def walk_minutes(a, b, base=0.0):
    return round(haversine(a, b) / 1000 / WALK_SPEED_KMH * 60 * WALK_DETOUR + base, 2)


def resolve(stop_id, stops, nodes):
    seen = set()
    while stop_id not in nodes and stop_id in stops and stop_id not in seen:
        seen.add(stop_id)
        stop_id = stops[stop_id]["parent"]
    return stop_id if stop_id in nodes else None


def main():
    with zipfile.ZipFile(FEED) as zf:
        stops = {}
        for row in read_table(zf, "stops.txt"):
            stops[row["stop_id"]] = {
                "name": row["stop_name"],
                "lat": float(row["stop_lat"]),
                "lon": float(row["stop_lon"]),
                "location_type": row["location_type"],
                "parent": row["parent_station"],
                "platform_code": row["platform_code"],
            }

        nodes = {}
        for sid, s in stops.items():
            parent = s["parent"]
            if s["location_type"] == "1":
                nodes[sid] = {
                    "name": s["name"], "lat": s["lat"], "lon": s["lon"],
                    "cat": "rail" if sid.startswith("MTR-") else "stop",
                    "type": "station", "station": True, "parent": None,
                }
            elif sid.startswith("MTR-PLATFORM-") and parent:
                station = stops.get(parent, {}).get("name", parent)
                nodes[sid] = {
                    "name": f"{station} · Platform {s['platform_code']}",
                    "lat": s["lat"], "lon": s["lon"], "cat": "rail",
                    "type": "platform", "station": False, "parent": parent,
                }
            elif sid.startswith("MTR-ENTRANCE-") and parent:
                station = stops.get(parent, {}).get("name", parent)
                nodes[sid] = {
                    "name": f"{station} · Exit {s['name']}",
                    "lat": s["lat"], "lon": s["lon"], "cat": "exit",
                    "type": "exit", "station": False, "parent": parent,
                }
            elif s["location_type"] == "0" and not parent:
                nodes[sid] = {
                    "name": s["name"], "lat": s["lat"], "lon": s["lon"],
                    "cat": "bus", "type": "bus", "station": False, "parent": None,
                }

        route_cat = {}
        for row in read_table(zf, "routes.txt"):
            agency = row["agency_id"]
            route_cat[row["route_id"]] = "rail" if agency == "MTRR" else "ferry" if agency == "FERRY" else "lightRail" if agency == "LR" else "bus"

        trip_route = {}
        for row in read_table(zf, "trips.txt"):
            trip_route[row["trip_id"]] = row["route_id"]

        headways = defaultdict(list)
        for row in read_table(zf, "frequencies.txt"):
            start = to_minutes(row["start_time"])
            end = to_minutes(row["end_time"])
            headway = int(row["headway_secs"]) / 60
            if headway <= 0:
                continue
            weight = 3 if (start is not None and end is not None and start <= 600 <= end) else 1
            headways[row["trip_id"]].extend([headway] * weight)

        trip_pattern = {}
        for row in read_table(zf, "stop_times.txt"):
            tid = row["trip_id"]
            if tid not in trip_route:
                continue
            seq = int(row["stop_sequence"])
            node = resolve(row["stop_id"], stops, nodes)
            if node is None:
                continue
            dep = to_minutes(row["departure_time"]) or to_minutes(row["arrival_time"])
            trip_pattern.setdefault(tid, []).append((seq, node, dep))

        pattern_edges = defaultdict(lambda: defaultdict(list))
        pattern_waits = defaultdict(list)
        for tid, records in trip_pattern.items():
            records.sort()
            node_seq = [node for _, node, _ in records]
            times = [t for _, _, t in records if t is not None]
            if len(node_seq) < 2 or len(times) != len(records):
                continue
            pattern = tuple(node_seq)
            route = trip_route[tid]
            waits = headways.get(tid, [])
            wait = min(statistics.median(waits), MAX_WAIT_MIN) / 2 if waits else 7.5
            pattern_waits[route].append((pattern, wait))
            for i in range(len(node_seq) - 1):
                dt = times[i + 1] - times[i]
                if 0 < dt < 60:
                    pattern_edges[(route, pattern)][i].append(dt)

    lines = {}
    for (route, pattern), edge_map in pattern_edges.items():
        waits = [w for p, w in pattern_waits[route] if p == pattern]
        wait = statistics.median(waits) if waits else 7.5
        cat = route_cat.get(route, "bus")
        line_id = f"{route}#{len(lines)}"
        lines[line_id] = {
            "cat": cat,
            "wait": round(wait + BOARD_PENALTY[cat], 2),
            "stops": list(pattern),
            "edges": [round(statistics.median(vals), 2) for _, vals in sorted(edge_map.items())],
        }

    adjust_edges(lines, nodes)

    station_platforms = defaultdict(list)
    station_exits = defaultdict(list)
    station_lines = defaultdict(set)
    for nid, n in nodes.items():
        if n["type"] == "platform":
            station_platforms[n["parent"]].append(nid)
        elif n["type"] == "exit":
            station_exits[n["parent"]].append(nid)
    for line in lines.values():
        if line["cat"] != "rail":
            continue
        for nid in line["stops"]:
            parent = nodes[nid]["parent"]
            if parent:
                station_lines[parent].add(nid)

    walk = []
    surface = [nid for nid, n in nodes.items() if n["type"] in ("station", "exit", "bus")]
    cells = defaultdict(list)
    cell_size = 0.005
    for nid in surface:
        n = nodes[nid]
        cells[(int(n["lat"] / cell_size), int(n["lon"] / cell_size))].append(nid)
    for nid in surface:
        n = nodes[nid]
        cx, cy = int(n["lat"] / cell_size), int(n["lon"] / cell_size)
        nearby = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for other in cells.get((cx + dx, cy + dy), []):
                    if other == nid:
                        continue
                    d = haversine(n, nodes[other])
                    if d <= WALK_RADIUS_M:
                        nearby.append((d, other))
        nearby.sort()
        for d, other in nearby[:WALK_NEIGHBOURS]:
            walk.append([nid, other, walk_minutes(n, nodes[other])])

    def interchange_bonus(station):
        code = station.replace("MTR-", "")
        return BIG_INTERCHANGES.get(code, 0.0)

    for station, platforms in station_platforms.items():
        exits = station_exits[station]
        count = len(platforms)
        line_count = len(station_lines[station])
        for pid in platforms:
            for eid in exits:
                base = 1.2 + min(2.0, 0.25 * (count - 2)) + 0.5 * interchange_bonus(station)
                cost = walk_minutes(nodes[pid], nodes[eid], base)
                walk.append([pid, eid, cost])
                walk.append([eid, pid, cost])
            if station in nodes:
                base = 1.5 + min(2.0, 0.25 * (count - 2)) + 0.5 * interchange_bonus(station)
                cost = walk_minutes(nodes[pid], nodes[station], base)
                walk.append([pid, station, cost])
                walk.append([station, pid, cost])
        for i, p1 in enumerate(platforms):
            for p2 in platforms[i + 1:]:
                base = 1.5 + min(2.5, 0.35 * (count - 2)) + 0.4 * max(0, line_count - 1) + 0.5 * interchange_bonus(station)
                cost = walk_minutes(nodes[p1], nodes[p2], base)
                walk.append([p1, p2, cost])
                walk.append([p2, p1, cost])

    graph = {"nodes": nodes, "lines": lines, "walk": walk, "walkRadiusM": WALK_RADIUS_M}
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(graph, fh, separators=(",", ":"), ensure_ascii=False)

    export_client(nodes, lines, walk)

    print(f"nodes={len(nodes)} platforms={sum(map(len, station_platforms.values()))} "
          f"exits={sum(map(len, station_exits.values()))} lines={len(lines)} "
          f"walk_edges={len(walk)} size={os.path.getsize(OUT)/1e6:.1f}MB")


def station_name(node):
    name = node["name"]
    for sep in (" · Platform ", " · Exit "):
        if sep in name:
            return name.split(sep)[0]
    return name


def adjust_edges(lines, nodes):
    """Correct feed clocks that are a flat 45 km/h, and layovers stored as rides."""
    pair = defaultdict(list)
    for line in lines.values():
        stops, edges = line["stops"], line["edges"]
        if len(edges) != len(stops) - 1:
            continue
        for i, dt in enumerate(edges):
            dist = haversine(nodes[stops[i]], nodes[stops[i + 1]])
            if line["cat"] == "rail" and dist > 3000:
                synthetic = dist / 1000 / 45 * 60
                if abs(dt - synthetic) < 0.4:
                    dt = dist / 1000 / 80 * 60
            if dist < 800 and dt >= 15:
                dt = max(1, dist / 1000 / 12 * 60)
            edges[i] = round(dt, 2)
            if line["cat"] in ("rail", "lightRail"):
                pair[tuple(sorted((station_name(nodes[stops[i]]), station_name(nodes[stops[i + 1]]))))].append((edges, i))
    for items in pair.values():
        times = [bucket[index] for bucket, index in items]
        short, long = min(times), max(times)
        if short > 0 and long > short * 2:
            for bucket, index in items:
                bucket[index] = round(short, 2)


def line_label(line_id):
    route = line_id.split("#")[0]
    if route.startswith("MTR-"):
        return "MTR " + route[4:]
    if "-" in route:
        return route.split("-", 1)[1]
    return route


def export_client(nodes, lines, walk):
    order = list(nodes.keys())
    index = {nid: i for i, nid in enumerate(order)}
    kinds = {"station": 1, "platform": 2, "exit": 3, "bus": 4, "stop": 5}
    node_data = {
        "names": [nodes[n]["name"] for n in order],
        "lat": [round(nodes[n]["lat"], 5) for n in order],
        "lon": [round(nodes[n]["lon"], 5) for n in order],
        "kind": [kinds.get(nodes[n]["type"], 0) for n in order],
        "st": [1 if nodes[n]["station"] else 0 for n in order],
    }
    line_data = []
    for lid, line in lines.items():
        line_data.append({
            "l": line_label(lid),
            "c": CAT_CODE[line["cat"]],
            "w": line["wait"],
            "s": [index[n] for n in line["stops"]],
            "e": line["edges"],
        })
    walk_data = [[index[a], index[b], t] for a, b, t in walk]
    with open(os.path.join(DATA, "nodes.json"), "w", encoding="utf-8") as fh:
        json.dump(node_data, fh, separators=(",", ":"), ensure_ascii=False)
    with open(os.path.join(DATA, "network.json"), "w", encoding="utf-8") as fh:
        json.dump({"lines": line_data, "walk": walk_data}, fh, separators=(",", ":"))
    for name in ("nodes.json", "network.json"):
        path = os.path.join(DATA, name)
        print(f"  {name}: {os.path.getsize(path)/1e6:.2f}MB")


if __name__ == "__main__":
    main()
