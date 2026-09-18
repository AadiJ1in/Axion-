#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml"))

from mediapipe_model import DEFAULT_MEDIAPIPE_MODEL_SHA256, DEFAULT_MEDIAPIPE_MODEL_URL  # noqa: E402

source = (ROOT / "src" / "mediapipe-config.js").read_text(encoding="utf-8")
url_match = re.search(r'url:\s*"([^"]+pose_landmarker_lite\.task)"', source)
hash_match = re.search(r'sha256:\s*"([a-f0-9]{64})"', source)
assert url_match, "Could not locate browser MediaPipe model URL."
assert hash_match, "Could not locate browser MediaPipe model SHA-256."
assert url_match.group(1) == DEFAULT_MEDIAPIPE_MODEL_URL, "Browser/offline MediaPipe model URL drifted."
assert hash_match.group(1) == DEFAULT_MEDIAPIPE_MODEL_SHA256, "Browser/offline MediaPipe model hash drifted."
print("Browser/offline MediaPipe model configuration is synchronized.")
