#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml"))

from mediapipe_model import (  # noqa: E402
    DEFAULT_MEDIAPIPE_MODEL_APP_PATH,
    DEFAULT_MEDIAPIPE_MODEL_SHA256,
    DEFAULT_MEDIAPIPE_MODEL_SOURCE_URL,
)

source = (ROOT / "src" / "mediapipe-config.js").read_text(encoding="utf-8")
source_url_match = re.search(r'sourceUrl:\s*"([^"]+pose_landmarker_lite\.task)"', source)
app_path_match = re.search(r'appPath:\s*"([^"]+\.task)"', source)
hash_match = re.search(r'sha256:\s*"([a-f0-9]{64})"', source)

assert source_url_match, "Could not locate browser MediaPipe model sourceUrl."
assert app_path_match, "Could not locate browser MediaPipe bundled model appPath."
assert hash_match, "Could not locate browser MediaPipe model SHA-256."

assert source_url_match.group(1) == DEFAULT_MEDIAPIPE_MODEL_SOURCE_URL, (
    "Browser/offline MediaPipe source URL drifted."
)
assert app_path_match.group(1) == DEFAULT_MEDIAPIPE_MODEL_APP_PATH, (
    "Browser/offline bundled model path drifted."
)
assert hash_match.group(1) == DEFAULT_MEDIAPIPE_MODEL_SHA256, (
    "Browser/offline MediaPipe model hash drifted."
)

# Production should resolve the default model from Axion's own origin, not the
# external source URL used by the build-time integrity fetch.
assert "appRelativeRoot(baseUrl, DEFAULT_MODEL.appPath)" in source, (
    "Browser no longer appears to resolve the default pose model from Axion's origin."
)

print("Browser/offline MediaPipe model identity and bundled path are synchronized.")
