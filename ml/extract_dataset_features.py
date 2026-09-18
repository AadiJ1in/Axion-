#!/usr/bin/env python3
"""Stream local dataset videos through MediaPipe into Axion's canonical JS feature engine.

Raw video and landmark coordinates stay local and are never written to the output CSV.
The Python side performs pose inference; Node executes src/biomechanics.js so training
features stay aligned with the browser implementation.
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import cv2
import mediapipe as mp

REQUIRED_COLUMNS = ["participant_id", "exercise_id", "assessment_score", "video_path"]
OPTIONAL_COLUMNS = ["video_id", "camera_view", "recording_condition", "source_name"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path, help="CSV describing local dataset videos")
    parser.add_argument("--pose-model", required=True, type=Path, help="Local MediaPipe pose_landmarker.task model")
    parser.add_argument("--output", required=True, type=Path, help="Derived feature CSV")
    parser.add_argument("--target-fps", type=float, default=12.0, help="Maximum inference sampling rate per video")
    parser.add_argument("--max-videos", type=int, default=0, help="Optional cap for smoke testing; 0 means all")
    parser.add_argument("--failure-log", type=Path, default=None)
    parser.add_argument("--force", action="store_true", help="Reprocess video_ids already present in output")
    parser.add_argument("--dry-run", action="store_true", help="Validate manifest/paths without pose inference")
    return parser.parse_args()


def read_manifest(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = reader.fieldnames or []
        missing = [column for column in REQUIRED_COLUMNS if column not in fields]
        if missing:
            raise SystemExit(f"Manifest is missing required columns: {', '.join(missing)}")
        return [dict(row) for row in reader]


def completed_video_ids(output: Path) -> set[str]:
    if not output.exists() or output.stat().st_size == 0:
        return set()
    with output.open("r", encoding="utf-8", newline="") as handle:
        return {str(row.get("video_id") or "").strip() for row in csv.DictReader(handle) if row.get("video_id")}


def resolved_video_path(manifest: Path, raw_path: str) -> Path:
    candidate = Path(raw_path).expanduser()
    if candidate.is_absolute():
        return candidate
    return (manifest.parent / candidate).resolve()


def normalize_row(manifest: Path, row: dict[str, str]) -> dict[str, Any]:
    video_path = resolved_video_path(manifest, str(row.get("video_path") or "").strip())
    video_id = str(row.get("video_id") or "").strip() or video_path.as_posix()
    return {
        "video_id": video_id,
        "participant_id": str(row.get("participant_id") or "").strip(),
        "exercise_id": str(row.get("exercise_id") or "").strip(),
        "assessment_score": str(row.get("assessment_score") or "").strip(),
        "camera_view": str(row.get("camera_view") or "").strip(),
        "recording_condition": str(row.get("recording_condition") or "").strip(),
        "source_name": str(row.get("source_name") or video_path.name).strip(),
        "video_path": video_path,
    }


def landmark_dict(landmark: Any) -> dict[str, float]:
    result = {
        "x": float(landmark.x),
        "y": float(landmark.y),
        "z": float(landmark.z),
    }
    visibility = getattr(landmark, "visibility", None)
    presence = getattr(landmark, "presence", None)
    if visibility is not None:
        result["visibility"] = float(visibility)
    if presence is not None:
        result["presence"] = float(presence)
    return result


def write_event(process: subprocess.Popen[str], event: dict[str, Any]) -> None:
    if process.stdin is None:
        raise RuntimeError("feature reducer stdin is unavailable")
    process.stdin.write(json.dumps(event, separators=(",", ":")) + "\n")


def failure_writer(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    exists = path.exists() and path.stat().st_size > 0
    handle = path.open("a", encoding="utf-8", newline="")
    writer = csv.DictWriter(handle, fieldnames=["video_id", "video_path", "error"])
    if not exists:
        writer.writeheader()
    return handle, writer


def main() -> None:
    args = parse_args()
    if args.target_fps <= 0 or args.target_fps > 60:
        raise SystemExit("--target-fps must be greater than 0 and at most 60")
    if not args.manifest.exists():
        raise SystemExit(f"Manifest not found: {args.manifest}")
    if not args.pose_model.exists() and not args.dry_run:
        raise SystemExit(f"Pose model not found: {args.pose_model}")

    rows = [normalize_row(args.manifest, row) for row in read_manifest(args.manifest)]
    bad = [row["video_id"] for row in rows if not row["participant_id"] or not row["exercise_id"] or not row["assessment_score"]]
    if bad:
        raise SystemExit(f"Rows contain empty participant/exercise/assessment fields; first affected video_id: {bad[0]}")

    missing_paths = [row["video_path"] for row in rows if not row["video_path"].exists()]
    if missing_paths:
        raise SystemExit(f"Video file not found: {missing_paths[0]}")

    if args.max_videos > 0:
        rows = rows[: args.max_videos]

    already_done = set() if args.force else completed_video_ids(args.output)
    pending = [row for row in rows if row["video_id"] not in already_done]

    print(json.dumps({
        "manifest_rows": len(rows),
        "already_completed": len(rows) - len(pending),
        "pending": len(pending),
        "target_fps": args.target_fps,
        "dry_run": args.dry_run,
    }, indent=2))

    if args.dry_run or not pending:
        return

    args.output.parent.mkdir(parents=True, exist_ok=True)
    failure_log = args.failure_log or args.output.with_suffix(".failures.csv")
    failure_handle, failure_csv = failure_writer(failure_log)

    reducer = subprocess.Popen(
        ["node", "ml/landmarks_to_features.mjs", "--output", str(args.output)],
        stdin=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    BaseOptions = mp.tasks.BaseOptions
    PoseLandmarker = mp.tasks.vision.PoseLandmarker
    PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
    RunningMode = mp.tasks.vision.RunningMode
    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(args.pose_model)),
        running_mode=RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.55,
        min_pose_presence_confidence=0.55,
        min_tracking_confidence=0.55,
    )

    processed = 0
    failed = 0
    try:
        with PoseLandmarker.create_from_options(options) as landmarker:
            for index, row in enumerate(pending, start=1):
                cap = cv2.VideoCapture(str(row["video_path"]))
                try:
                    if not cap.isOpened():
                        raise RuntimeError("OpenCV could not open video")
                    source_fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
                    if source_fps <= 0:
                        source_fps = 30.0
                    sample_interval_ms = 1000.0 / args.target_fps
                    next_sample_ms = 0.0
                    frame_index = 0
                    emitted = 0
                    last_timestamp = -1

                    write_event(reducer, {
                        "type": "video_start",
                        **{key: row[key] for key in ["video_id", "participant_id", "exercise_id", "assessment_score", "camera_view", "recording_condition", "source_name"]},
                    })

                    while True:
                        ok, bgr = cap.read()
                        if not ok:
                            break
                        timestamp_ms = (frame_index / source_fps) * 1000.0
                        frame_index += 1
                        if timestamp_ms + 1e-6 < next_sample_ms:
                            continue
                        next_sample_ms += sample_interval_ms
                        timestamp_int = max(last_timestamp + 1, int(round(timestamp_ms)))
                        last_timestamp = timestamp_int
                        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                        result = landmarker.detect_for_video(image, timestamp_int)
                        if not result.pose_landmarks:
                            continue
                        image_landmarks = [landmark_dict(item) for item in result.pose_landmarks[0]]
                        world_landmarks = None
                        if result.pose_world_landmarks:
                            world_landmarks = [landmark_dict(item) for item in result.pose_world_landmarks[0]]
                        write_event(reducer, {
                            "type": "frame",
                            "timestamp_ms": timestamp_int,
                            "image_landmarks": image_landmarks,
                            "world_landmarks": world_landmarks,
                        })
                        emitted += 1

                    if emitted == 0:
                        raise RuntimeError("No usable pose frames were detected")
                    write_event(reducer, {"type": "video_end", "video_id": row["video_id"]})
                    if reducer.stdin is not None:
                        reducer.stdin.flush()
                    processed += 1
                    print(f"[{index}/{len(pending)}] processed {row['video_id']} ({emitted} pose frames)")
                except Exception as exc:  # Continue the dataset run; record the bad video for inspection.
                    failed += 1
                    failure_csv.writerow({"video_id": row["video_id"], "video_path": row["video_path"], "error": str(exc)})
                    failure_handle.flush()
                    print(f"[{index}/{len(pending)}] FAILED {row['video_id']}: {exc}", file=sys.stderr)
                    # A failed video can leave the streaming reducer in an open-video state.
                    # Restart it so the next video begins from a clean accumulator.
                    if reducer.stdin is not None:
                        reducer.stdin.close()
                    reducer.wait(timeout=10)
                    reducer = subprocess.Popen(
                        ["node", "ml/landmarks_to_features.mjs", "--output", str(args.output)],
                        stdin=subprocess.PIPE,
                        text=True,
                        bufsize=1,
                    )
                finally:
                    cap.release()
    finally:
        failure_handle.close()
        if reducer.stdin is not None and not reducer.stdin.closed:
            reducer.stdin.close()
        exit_code = reducer.wait(timeout=30)

    if exit_code != 0:
        raise SystemExit(f"Feature reducer exited with code {exit_code}")
    print(json.dumps({"processed": processed, "failed": failed, "output": str(args.output), "failure_log": str(failure_log)}, indent=2))


if __name__ == "__main__":
    main()
