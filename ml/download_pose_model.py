#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import os
import tempfile
import urllib.request
from pathlib import Path

from mediapipe_model import DEFAULT_MEDIAPIPE_MODEL_SHA256, DEFAULT_MEDIAPIPE_MODEL_URL


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description="Download Axion's pinned MediaPipe pose model with SHA-256 verification.")
    parser.add_argument("--output", type=Path, default=Path("ml/models/pose_landmarker_lite.task"))
    args = parser.parse_args()

    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    if output.exists() and sha256_file(output) == DEFAULT_MEDIAPIPE_MODEL_SHA256:
        print(f"Verified existing model: {output}")
        return

    with tempfile.NamedTemporaryFile(prefix="axion-pose-", suffix=".task", delete=False) as temp:
        temp_path = Path(temp.name)
    try:
        request = urllib.request.Request(
            DEFAULT_MEDIAPIPE_MODEL_URL,
            headers={"User-Agent": "Axion-research-model-downloader/1.0"},
        )
        with urllib.request.urlopen(request, timeout=60) as response, temp_path.open("wb") as target:
            while chunk := response.read(1024 * 1024):
                target.write(chunk)

        actual = sha256_file(temp_path)
        if actual != DEFAULT_MEDIAPIPE_MODEL_SHA256:
            raise SystemExit(
                "Downloaded MediaPipe model failed SHA-256 verification. "
                f"Expected {DEFAULT_MEDIAPIPE_MODEL_SHA256}, got {actual}."
            )
        os.replace(temp_path, output)
        print(f"Downloaded and verified: {output}")
    finally:
        temp_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
