#!/usr/bin/env python3
"""Extract Axion biomechanics features from local MobiPhysio-style video datasets.

Source videos remain local. The output CSV contains metadata, extraction quality,
and derived numeric biomechanics only; it does not contain images or landmarks.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import math
import sys
from pathlib import Path
from typing import Any

from biomechanics_v1 import MODEL_FEATURES_V1, VideoBiomechanicsAccumulator, extract_biomechanics_frame, flatten_training_row
from mediapipe_model import DEFAULT_MEDIAPIPE_MODEL_SHA256


VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".m4v", ".webm"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def safe_relative_video(root: Path, raw_value: str) -> tuple[Path, str]:
    root = root.resolve()
    candidate = (root / raw_value).resolve()
    try:
        relative = candidate.relative_to(root)
    except ValueError as error:
        raise ValueError("video path escapes --videos-root") from error
    if candidate.suffix.lower() not in VIDEO_EXTENSIONS:
        raise ValueError(f"unsupported video extension: {candidate.suffix or '<none>'}")
    return candidate, relative.as_posix()


def landmark_dict(landmark: Any) -> dict[str, float | None]:
    return {
        "x": parse_float(getattr(landmark, "x", None)),
        "y": parse_float(getattr(landmark, "y", None)),
        "z": parse_float(getattr(landmark, "z", None)),
        "visibility": parse_float(getattr(landmark, "visibility", None)),
    }


def load_dependencies():
    try:
        import cv2  # type: ignore
        import mediapipe as mp  # type: ignore
    except ImportError as error:
        raise SystemExit(
            "Offline video extraction dependencies are missing. "
            "Run: python -m pip install -r ml/requirements-extraction.txt"
        ) from error
    return cv2, mp


def process_video(
    *,
    video_path: Path,
    landmarker: Any,
    cv2: Any,
    mp: Any,
    sample_fps: float,
    minimum_visibility: float,
) -> tuple[dict[str, Any], dict[str, Any]]:
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError("video_open_failed")

    reported_fps = parse_float(capture.get(cv2.CAP_PROP_FPS))
    fps = reported_fps if reported_fps and reported_fps > 0 else 30.0
    sample_every = max(1, int(round(fps / sample_fps)))
    accumulator = VideoBiomechanicsAccumulator()
    decoded_frames = 0
    sampled_frames = 0
    no_pose_frames = 0
    multi_pose_frames = 0
    frame_index = 0
    last_timestamp = -1

    try:
        while True:
            ok, bgr = capture.read()
            if not ok:
                break
            decoded_frames += 1
            if frame_index % sample_every != 0:
                frame_index += 1
                continue

            sampled_frames += 1
            accumulator.observe_sample()
            timestamp_ms = max(last_timestamp + 1, int(round(frame_index / fps * 1000)))
            last_timestamp = timestamp_ms
            frame_index += 1

            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = landmarker.detect_for_video(image, timestamp_ms)

            poses = getattr(result, "pose_landmarks", None) or []
            if not poses:
                no_pose_frames += 1
                continue
            if len(poses) != 1:
                multi_pose_frames += 1
                continue

            image_landmarks = [landmark_dict(item) for item in poses[0]]
            world_sets = getattr(result, "pose_world_landmarks", None) or []
            world_landmarks = [landmark_dict(item) for item in world_sets[0]] if len(world_sets) == 1 else None
            frame = extract_biomechanics_frame(
                image_landmarks=image_landmarks,
                world_landmarks=world_landmarks,
                timestamp_ms=timestamp_ms,
                minimum_visibility=minimum_visibility,
            )
            accumulator.observe_pose_frame(frame)
    finally:
        capture.release()

    summary = accumulator.finish()
    diagnostics = {
        "decoded_frames": decoded_frames,
        "sampled_frames": sampled_frames,
        "no_pose_frames": no_pose_frames,
        "multi_pose_frames": multi_pose_frames,
        "reported_fps": round(fps, 3),
        "sample_fps": sample_fps,
    }
    return summary, diagnostics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--videos-root", required=True, type=Path)
    parser.add_argument("--metadata-csv", required=True, type=Path)
    parser.add_argument("--output-csv", required=True, type=Path)
    parser.add_argument("--model", type=Path, default=Path("ml/models/pose_landmarker_lite.task"))
    parser.add_argument("--model-sha256", default=DEFAULT_MEDIAPIPE_MODEL_SHA256)
    parser.add_argument("--video-column", default="video_path")
    parser.add_argument("--participant-column", default="participant_id")
    parser.add_argument("--exercise-column", default="exercise_id")
    parser.add_argument("--score-column", default="assessment_score")
    parser.add_argument("--camera-view-column", default="camera_view")
    parser.add_argument("--source-column", default="source")
    parser.add_argument("--sample-fps", type=float, default=10.0)
    parser.add_argument("--minimum-visibility", type=float, default=0.55)
    parser.add_argument("--minimum-tracking-coverage", type=float, default=0.50)
    parser.add_argument("--maximum-missing-feature-fraction", type=float, default=0.35)
    parser.add_argument("--max-videos", type=int, default=None)
    parser.add_argument("--fail-fast", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not 0 < args.sample_fps <= 60:
        raise SystemExit("--sample-fps must be in (0, 60].")
    if not 0 <= args.minimum_visibility <= 1:
        raise SystemExit("--minimum-visibility must be between 0 and 1.")
    if not 0 <= args.minimum_tracking_coverage <= 1:
        raise SystemExit("--minimum-tracking-coverage must be between 0 and 1.")
    if not 0 <= args.maximum_missing_feature_fraction <= 1:
        raise SystemExit("--maximum-missing-feature-fraction must be between 0 and 1.")

    videos_root = args.videos_root.resolve()
    metadata_path = args.metadata_csv.resolve()
    model_path = args.model.resolve()
    if not videos_root.is_dir():
        raise SystemExit(f"Videos root does not exist: {videos_root}")
    if not metadata_path.is_file():
        raise SystemExit(f"Metadata CSV does not exist: {metadata_path}")
    if not model_path.is_file():
        raise SystemExit(
            f"Pose model does not exist: {model_path}. "
            "Run: python ml/download_pose_model.py"
        )

    actual_model_hash = sha256_file(model_path)
    expected_model_hash = args.model_sha256.lower().strip()
    if actual_model_hash != expected_model_hash:
        raise SystemExit(
            "Pose model SHA-256 mismatch. "
            f"Expected {expected_model_hash}, got {actual_model_hash}."
        )

    with metadata_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        metadata_rows = list(reader)
        fieldnames = reader.fieldnames or []

    required = {
        args.video_column,
        args.participant_column,
        args.exercise_column,
        args.score_column,
    }
    missing_columns = sorted(required.difference(fieldnames))
    if missing_columns:
        raise SystemExit(f"Metadata CSV is missing columns: {', '.join(missing_columns)}")

    if args.max_videos is not None:
        metadata_rows = metadata_rows[: max(0, args.max_videos)]

    seen_videos: set[str] = set()
    cv2, mp = load_dependencies()

    BaseOptions = mp.tasks.BaseOptions
    PoseLandmarker = mp.tasks.vision.PoseLandmarker
    PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
    RunningMode = mp.tasks.vision.RunningMode

    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(model_path)),
        running_mode=RunningMode.VIDEO,
        num_poses=2,
        min_pose_detection_confidence=0.55,
        min_pose_presence_confidence=0.55,
        min_tracking_confidence=0.55,
        output_segmentation_masks=False,
    )

    results: list[dict[str, Any]] = []
    with PoseLandmarker.create_from_options(options) as landmarker:
        for index, metadata in enumerate(metadata_rows, start=1):
            output: dict[str, Any] = {
                "participant_id": metadata.get(args.participant_column, "").strip(),
                "exercise_id": metadata.get(args.exercise_column, "").strip(),
                "assessment_score": metadata.get(args.score_column, "").strip(),
                "camera_view": metadata.get(args.camera_view_column, "").strip() if args.camera_view_column in metadata else "",
                "source": metadata.get(args.source_column, "").strip() if args.source_column in metadata else "",
                "source_video": "",
                "extraction_status": "error",
                "extraction_error": "",
                "model_sha256": actual_model_hash,
            }

            try:
                score = parse_float(output["assessment_score"])
                if score is None or not 0 <= score <= 100:
                    raise ValueError("assessment_score must be numeric and scaled to 0-100")
                output["assessment_score"] = round(score, 4)
                if not output["participant_id"]:
                    raise ValueError("participant id is empty")
                if not output["exercise_id"]:
                    raise ValueError("exercise id is empty")

                video_path, relative_video = safe_relative_video(videos_root, metadata.get(args.video_column, "").strip())
                output["source_video"] = relative_video
                if relative_video in seen_videos:
                    raise ValueError("duplicate source video in metadata")
                seen_videos.add(relative_video)
                if not video_path.is_file():
                    raise FileNotFoundError("video file is missing")

                summary, diagnostics = process_video(
                    video_path=video_path,
                    landmarker=landmarker,
                    cv2=cv2,
                    mp=mp,
                    sample_fps=args.sample_fps,
                    minimum_visibility=args.minimum_visibility,
                )
                output.update(flatten_training_row(summary))
                output.update(diagnostics)

                missing_features = sum(output.get(name) in (None, "") for name in MODEL_FEATURES_V1)
                missing_fraction = missing_features / len(MODEL_FEATURES_V1)
                output["missing_feature_fraction"] = round(missing_fraction, 4)

                if not output.get("sampled_frames"):
                    output["extraction_status"] = "no_decodable_frames"
                elif not output.get("pose_frames"):
                    output["extraction_status"] = "no_pose"
                elif (output.get("tracking_coverage") or 0) < args.minimum_tracking_coverage:
                    output["extraction_status"] = "low_tracking_coverage"
                elif missing_fraction > args.maximum_missing_feature_fraction:
                    output["extraction_status"] = "too_many_missing_features"
                else:
                    output["extraction_status"] = "ok"
            except Exception as error:
                output["extraction_error"] = type(error).__name__ + ": " + str(error)
                if args.fail_fast:
                    raise
            results.append(output)
            print(f"[{index}/{len(metadata_rows)}] {output.get('source_video') or '<metadata row>'}: {output['extraction_status']}", file=sys.stderr)

    base_columns = [
        "participant_id",
        "exercise_id",
        "assessment_score",
        "camera_view",
        "source",
        "source_video",
        "extraction_status",
        "extraction_error",
        "model_sha256",
        "biomechanics_schema_version",
        "decoded_frames",
        "sampled_frames",
        "pose_frames",
        "usable_frames",
        "no_pose_frames",
        "multi_pose_frames",
        "reported_fps",
        "sample_fps",
        "pose_detection_rate",
        "tracking_coverage",
        "mean_visibility",
        "min_visibility",
        "missing_feature_fraction",
    ]
    feature_columns: list[str] = []
    for feature in MODEL_FEATURES_V1:
        feature_columns.extend([feature, f"{feature}__min", f"{feature}__max", f"{feature}__range"])
    output_columns = base_columns + feature_columns

    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    with args.output_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=output_columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(results)

    ok_count = sum(row["extraction_status"] == "ok" for row in results)
    print(
        f"Wrote {len(results)} rows to {args.output_csv} ({ok_count} training-eligible, {len(results) - ok_count} rejected)."
    )


if __name__ == "__main__":
    main()
