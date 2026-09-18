"""Pinned MediaPipe pose model used by Axion's offline research pipeline.

The browser serves this model from Axion's own origin in production, but both the
browser build and offline extractor derive the bytes from the same verified source.
"""

DEFAULT_MEDIAPIPE_MODEL_ID = "pose-landmarker-lite-float16-v1"
DEFAULT_MEDIAPIPE_MODEL_SOURCE_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
)
DEFAULT_MEDIAPIPE_MODEL_APP_PATH = "models/pose-landmarker-lite-float16-v1.task"
DEFAULT_MEDIAPIPE_MODEL_SHA256 = "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a"

# Backward-compatible alias used by the downloader.
DEFAULT_MEDIAPIPE_MODEL_URL = DEFAULT_MEDIAPIPE_MODEL_SOURCE_URL
