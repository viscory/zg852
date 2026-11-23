#!/usr/bin/env python3
"""Build a compact HK graph with MTR platforms, exits, transfers and bus stops."""

import csv
import json
import math
import os
import re
import statistics
import zipfile
from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict

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
SHAPE_TOLERANCE_M = 30.0
SHAPE_SNAP_M = 400.0

BIG_INTERCHANGES = {"ADM": 2.0, "CEN": 1.5, "MOK": 1.0, "KOT": 1.0, "TSY": 0.5, "TAW": 0.5}


def to_minutes(text):
    if not text:
        return None
    parts = text.split(":")
    return int(parts[0]) * 60 + int(parts[1]) + int(parts[2]) / 60


def haversine_xy(lat1, lon1, lat2, lon2):
    lat1, lon1 = math.radians(lat1), math.radians(lon1)
    lat2, lon2 = math.radians(lat2), math.radians(lon2)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def haversine(a, b):
    return haversine_xy(a["lat"], a["lon"], b["lat"], b["lon"])


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


def read_shapes(zf, wanted):
    """Read only the shapes used by exported lines, keyed by shape_id.

    Each value is a pair of parallel lists: cumulative distances (metres) and
    [lat, lon] points quantised to the same precision as nodes.json.
    """
    points = defaultdict(list)
    if not wanted:
        return {}
    for row in read_table(zf, "shapes.txt"):
        sid = row["shape_id"]
        if sid not in wanted:
            continue
        try:
            lat, lon = round(float(row["shape_pt_lat"]), 5), round(float(row["shape_pt_lon"]), 5)
            seq = int(row["shape_pt_sequence"])
        except (KeyError, TypeError, ValueError):
            continue
        try:
            dist = float(row["shape_dist_traveled"])
        except (KeyError, TypeError, ValueError):
            dist = None
        points[sid].append((seq, dist, lat, lon))
    result = {}
    for sid, rows in points.items():
        rows.sort(key=lambda item: item[0])
        dists, coords, last, previous = [], [], None, None
        travelled = 0.0
        for _, dist, lat, lon in rows:
            if last is not None:
                travelled += haversine_xy(last[0], last[1], lat, lon)
                if dist is None or dist < travelled - 1:
                    dist = travelled
            if dist is None:
                dist = travelled
            if previous is not None and dist <= previous:
                dist = previous + 1e-6
            dists.append(dist)
            coords.append([lat, lon])
            last, previous = (lat, lon), dist
        result[sid] = (dists, coords)
    return result


def nearest_shape_point(coords, lat, lon):
    """Index and metres of the shape point closest to a stop coordinate."""
    scale_x = 111320 * math.cos(math.radians(lat))
    best, index = float("inf"), None
    for i, (plat, plon) in enumerate(coords):
        dx, dy = (plon - lon) * scale_x, (plat - lat) * 110540
        distance = dx * dx + dy * dy
        if distance < best:
            best, index = distance, i
    return index, math.sqrt(best) if index is not None else float("inf")


def stop_distances_for_line(shape, distances, stops, nodes):
    """Use GTFS stop distances when complete, otherwise snap stops to the shape."""
    usable = (distances and len(distances) == len(stops)
              and all(d is not None for d in distances)
              and all(distances[i] < distances[i + 1] for i in range(len(distances) - 1)))
    if usable:
        return distances
    if not shape:
        return None
    _, coords = shape
    snapped, previous = [], -1.0
    for stop in stops:
        node = nodes[stop]
        index, metres = nearest_shape_point(coords, node["lat"], node["lon"])
        distance = shape[0][index] if index is not None and metres <= SHAPE_SNAP_M else None
        if distance is not None and distance > previous:
            snapped.append(distance)
            previous = distance
        else:
            snapped.append(None)
    return snapped


def simplify_shape(coords, tolerance, ref_lat, max_interior=None):
    """Ramer-Douglas-Peucker on locally projected metres, keeping endpoints."""
    if len(coords) <= 2:
        return coords
    scale_x = 111320 * math.cos(math.radians(ref_lat))
    projected = [(lon * scale_x, lat * 110540) for lat, lon in coords]
    keep = [False] * len(coords)
    keep[0] = keep[-1] = True
    stack = [(0, len(coords) - 1)]
    while stack:
        start, end = stack.pop()
        ax, ay = projected[start]
        bx, by = projected[end]
        dx, dy = bx - ax, by - ay
        norm = dx * dx + dy * dy
        farthest, index = -1.0, None
        for i in range(start + 1, end):
            px, py = projected[i]
            if norm:
                ratio = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / norm))
                distance = math.hypot(px - (ax + ratio * dx), py - (ay + ratio * dy))
            else:
                distance = math.hypot(px - ax, py - ay)
            if distance > farthest:
                farthest, index = distance, i
        if index is not None and farthest > tolerance:
            keep[index] = True
            stack.append((start, index))
            stack.append((index, end))
    indices = [i for i in range(1, len(coords) - 1) if keep[i]]
    if max_interior is not None and len(indices) > max_interior:
        ax, ay = projected[0]
        bx, by = projected[-1]
        dx, dy = bx - ax, by - ay
        norm = dx * dx + dy * dy
        scored = []
        for i in indices:
            px, py = projected[i]
            if norm:
                ratio = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / norm))
                deviation = math.hypot(px - (ax + ratio * dx), py - (ay + ratio * dy))
            else:
                deviation = math.hypot(px - ax, py - ay)
            scored.append((deviation, i))
        indices = sorted(i for _, i in sorted(scored, reverse=True)[:max_interior])
    return [coords[0]] + [coords[i] for i in indices] + [coords[-1]]


def segment_geometry(shape, d0, d1, start, end):
    """Polyline for one stop-to-stop hop, anchored at the exact node coords."""
    first = [round(start["lat"], 5), round(start["lon"], 5)]
    last = [round(end["lat"], 5), round(end["lon"], 5)]
    fallback = [first, last]
    if not shape or d0 is None or d1 is None or not (d0 < d1):
        return fallback
    dists, coords = shape
    lo, hi = bisect_right(dists, d0), bisect_left(dists, d1)
    if hi <= lo:
        return fallback
    interior = [[round(lat, 4), round(lon, 4)] for lat, lon in coords[lo:hi]]
    span = haversine_xy(first[0], first[1], last[0], last[1])
    max_interior = 1 if span < 1200 else 4 if span < 4000 else 10
    poly = simplify_shape([first] + interior + [last], SHAPE_TOLERANCE_M, first[0], max_interior)
    deduped = [poly[0]]
    for coord in poly[1:]:
        if coord != deduped[-1]:
            deduped.append(coord)
    return deduped if len(deduped) > 1 else fallback


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
        route_long_name = {}
        for row in read_table(zf, "routes.txt"):
            agency = row["agency_id"]
            route_id = row["route_id"]
            route_cat[route_id] = "rail" if agency == "MTRR" else "ferry" if agency == "FERRY" else "lightRail" if agency == "LR" else "bus"
            route_long_name[route_id] = row["route_long_name"] or ""

        trip_route = {}
        trip_shape = {}
        for row in read_table(zf, "trips.txt"):
            trip_route[row["trip_id"]] = row["route_id"]
            trip_shape[row["trip_id"]] = row["shape_id"] or ""

        # One duration-weighted average headway per trip over the service day:
        # sum(headway_minutes * window_duration_minutes) / sum(window_duration_minutes).
        # Each trip therefore contributes a single wait, not repeated samples.
        headways = defaultdict(lambda: [0.0, 0.0])  # trip_id -> [weighted sum, total minutes]
        for row in read_table(zf, "frequencies.txt"):
            start = to_minutes(row["start_time"])
            end = to_minutes(row["end_time"])
            headway = int(row["headway_secs"]) / 60
            if headway <= 0 or start is None or end is None or end <= start:
                continue
            duration = end - start
            headways[row["trip_id"]][0] += headway * duration
            headways[row["trip_id"]][1] += duration

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
            try:
                distance = float(row["shape_dist_traveled"])
            except (KeyError, TypeError, ValueError):
                distance = None
            trip_pattern.setdefault(tid, []).append((seq, node, dep, distance))

        pattern_edges = defaultdict(lambda: defaultdict(list))
        pattern_waits = defaultdict(list)
        pattern_shapes = defaultdict(Counter)
        pattern_shape_distances = {}
        for tid, records in trip_pattern.items():
            records.sort()
            node_seq = [node for _, node, _, _ in records]
            times = [t for _, _, t, _ in records if t is not None]
            if len(node_seq) < 2 or len(times) != len(records):
                continue
            pattern = tuple(node_seq)
            route = trip_route[tid]
            shape_id = trip_shape.get(tid, "")
            if shape_id:
                key = (route, pattern, shape_id)
                pattern_shapes[(route, pattern)][shape_id] += 1
                candidate = tuple(d for _, _, _, d in records)
                previous = pattern_shape_distances.get(key)
                if previous is None or sum(d is None for d in candidate) < sum(d is None for d in previous):
                    pattern_shape_distances[key] = candidate
            weighted = headways.get(tid)
            if weighted and weighted[1] > 0:
                average_headway = weighted[0] / weighted[1]
                half_headway = min(average_headway, MAX_WAIT_MIN) / 2
            else:
                half_headway = 7.5
            pattern_waits[route].append((pattern, half_headway))
            for i in range(len(node_seq) - 1):
                dt = times[i + 1] - times[i]
                if 0 < dt < 60:
                    pattern_edges[(route, pattern)][i].append(dt)

        pattern_rep_shape = {
            key: max(counts.items(), key=lambda item: (item[1], item[0]))[0]
            for key, counts in pattern_shapes.items()
        }
        shapes = read_shapes(zf, set(pattern_rep_shape.values()))

    lines = {}
    line_geometry = {}
    for (route, pattern), edge_map in pattern_edges.items():
        half_headways = [h for p, h in pattern_waits[route] if p == pattern]
        half_headway = statistics.median(half_headways) if half_headways else 7.5
        cat = route_cat.get(route, "bus")
        line_id = f"{route}#{len(lines)}"
        lines[line_id] = {
            "cat": cat,
            "halfHeadway": round(half_headway, 2),
            "wait": round(BOARD_PENALTY[cat], 2),
            "stops": list(pattern),
            "edges": [round(statistics.median(vals), 2) for _, vals in sorted(edge_map.items())],
        }
        shape_id = pattern_rep_shape.get((route, pattern))
        shape = shapes.get(shape_id)
        distances = stop_distances_for_line(
            shape,
            pattern_shape_distances.get((route, pattern, shape_id)) if shape_id else None,
            pattern, nodes,
        )
        geometry = []
        for index, _ in sorted(edge_map.items()):
            d0 = distances[index] if distances and index < len(distances) else None
            d1 = distances[index + 1] if distances and index + 1 < len(distances) else None
            geometry.append(segment_geometry(shape, d0, d1,
                                             nodes[pattern[index]], nodes[pattern[index + 1]]))
        line_geometry[line_id] = geometry

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

    export_client(nodes, lines, walk, line_geometry, route_long_name)

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


def display_name(route_long_name, fallback):
    """Human-readable line name: long name without a trailing parenthetical."""
    name = re.sub(r"\s*\([^()]*\)\s*$", "", (route_long_name or "").strip()).strip()
    return name or fallback


def export_client(nodes, lines, walk, line_geometry, route_long_name):
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
        label = line_label(lid)
        line_data.append({
            "l": label,
            "n": display_name(route_long_name.get(lid.split("#")[0], ""), label),
            "c": CAT_CODE[line["cat"]],
            "w": line["wait"],
            "h": line["halfHeadway"],
            "s": [index[n] for n in line["stops"]],
            "e": line["edges"],
            "g": line_geometry[lid],
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
