#!/usr/bin/env python3
"""Run the existing Axion video/MediaPipe extractor with the AxionWBF reducer.

The video decoding and privacy behavior stay identical to extract_dataset_features.py;
only the Node reducer changes from MODEL_FEATURES_V1 to WHOLE_BODY_FEATURES_V1.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import extract_dataset_features as base


def start_wbf_reducer(output: Path) -> subprocess.Popen[str]:
    return subprocess.Popen(
        ["node", "ml/whole_body_landmarks_to_features.mjs", "--output", str(output)],
        stdin=subprocess.PIPE,
        text=True,
        bufsize=1,
    )


base.start_reducer = start_wbf_reducer


if __name__ == "__main__":
    base.main()
