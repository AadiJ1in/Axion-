#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml"))

from biomechanics_v1 import extract_biomechanics_frame  # noqa: E402

FIXTURE = ROOT / "ml" / "fixtures" / "biomechanics-parity.json"
JS_RUNNER = ROOT / "scripts" / "biomechanics-parity-json.mjs"


def skeleton(overrides):
    points = [{"x": 0.5, "y": 0.5, "z": 0, "visibility": 1} for _ in range(33)]
    for index, point in overrides.items():
        points[int(index)] = point
    return points


def assert_close(left, right, path):
    if left is None or right is None:
        assert left is right, f"{path}: {left!r} != {right!r}"
        return
    if isinstance(left, bool) or isinstance(right, bool):
        assert left == right, f"{path}: {left!r} != {right!r}"
        return
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        assert math.isclose(float(left), float(right), abs_tol=0.001), f"{path}: {left} != {right}"
        return
    if isinstance(left, dict) and isinstance(right, dict):
        assert left.keys() == right.keys(), f"{path}: keys differ"
        for key in left:
            assert_close(left[key], right[key], f"{path}.{key}")
        return
    assert left == right, f"{path}: {left!r} != {right!r}"


fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
js = json.loads(subprocess.check_output(["node", str(JS_RUNNER), str(FIXTURE)], text=True))
js_by_name = {item["name"]: item["frame"] for item in js}

for index, item in enumerate(fixture["cases"]):
    landmarks = skeleton(item["overrides"])
    py_frame = extract_biomechanics_frame(
        image_landmarks=landmarks,
        world_landmarks=landmarks,
        timestamp_ms=100 + index,
    )
    assert_close(py_frame, js_by_name[item["name"]], item["name"])

print(f"Biomechanics JS/Python parity passed for {len(fixture['cases'])} synthetic poses.")
