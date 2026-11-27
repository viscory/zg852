#!/usr/bin/env python3
"""Guard the canonical constants contract.

This is the Python half of the no-magic-numbers gate: eslint reads the numeric
leaves of config/constants.json as its allowlist, and this script checks that
the canonical file, the browser re-export, the no-cap policy and the service
worker version have not drifted apart.
"""

import json
import os
import re
import sys

from _constants import ROOT, load_constants, numeric_leaves


def read(relative):
    with open(os.path.join(ROOT, relative), "r", encoding="utf-8") as handle:
        return handle.read()


def main():
    errors = []
    constants = load_constants()

    for namespace in ("shared", "graph", "runtime", "fares", "hkbus", "poi", "build", "sw"):
        if not isinstance(constants.get(namespace), dict):
            errors.append(f"missing namespace: {namespace}")

    runtime = constants.get("runtime", {})
    if runtime.get("travelBudgetMinutes") is not None:
        errors.append("runtime.travelBudgetMinutes must be null (unbounded)")
    if runtime.get("minPeople") != 2 or runtime.get("maxPeople") != 8:
        errors.append("people limits drifted from the canonical 2..8 range")

    graph = constants.get("graph", {})
    for forbidden in ("maxWaitMin", "walkNeighbours", "edgeMaxMinutes"):
        if forbidden in graph:
            errors.append(f"forbidden cap in graph constants: {forbidden}")

    builder = read(os.path.join("scripts", "build_graph.py"))
    for forbidden in ("MAX_WAIT_MIN", "WALK_NEIGHBOURS"):
        if re.search(rf"\b{forbidden}\b", builder):
            errors.append(f"build_graph.py still uses {forbidden}")

    sw = read(os.path.join("static", "sw.js"))
    match = re.search(r"const\s+CACHE\s*=\s*'zg852-v(\d+)'", sw)
    if not match:
        errors.append("static/sw.js has no recognisable CACHE version")
    elif int(match.group(1)) != constants.get("sw", {}).get("cacheVersion"):
        errors.append(
            "sw cache drift: static/sw.js is v%s, config/constants.json says %s"
            % (match.group(1), constants["sw"]["cacheVersion"])
        )

    eslint = read("eslint.config.mjs")
    if "no-magic-numbers" not in eslint:
        errors.append("eslint no-magic-numbers rule is not enabled")
    if "numeric_leaves" not in eslint and "constants.json" not in eslint:
        errors.append("eslint allowlist is not derived from constants.json")

    config = read(os.path.join("src", "js", "config.js"))
    if "config/constants.json" not in config:
        errors.append("src/js/config.js does not import the canonical constants file")
    for name in ("MODE_BITS", "NODE_KINDS", "RESULTS_LIMIT", "MAX_PEOPLE", "TRAVEL_BUDGET_MINUTES"):
        if f"export const {name}" not in config:
            errors.append(f"config.js no longer re-exports {name}")

    # Every numeric leaf is in the eslint ignore set by construction; report
    # the count so a reviewer can see what the allowlist covers.
    leaves = sorted({value for value in numeric_leaves(constants)})
    print("constants check: %d namespaces, %d distinct numeric leaves, %d sw assets" % (
        len([key for key in constants if isinstance(constants[key], dict)]),
        len(leaves),
        len(constants.get("sw", {}).get("assets", [])),
    ))
    if errors:
        for error in errors:
            print("constants check failed:", error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
