"""Load the canonical constants file for offline build scripts.

One JSON document is the source of truth for values shared by the browser
bundle, the graph builder and the deployment guard. Python and JavaScript both
read that same document; neither keeps a second copy of a number.
"""

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONSTANTS_PATH = os.path.join(ROOT, "config", "constants.json")


def load_constants(path=CONSTANTS_PATH):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def numeric_leaves(value):
    """Yield every numeric leaf, including numbers nested in lists and dicts."""
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from numeric_leaves(child)
    elif isinstance(value, list):
        for child in value:
            yield from numeric_leaves(child)
