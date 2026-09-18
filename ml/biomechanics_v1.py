"""Pure-Python mirror of Axion biomechanics schema v1.

This module intentionally has no third-party dependencies so CI can verify that
offline/public-dataset feature extraction stays numerically aligned with the
browser implementation in src/biomechanics.js.

These values are descriptive movement measurements. They are not diagnoses,
injury probabilities, or clinically validated compensation labels.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping, Sequence

BIOMECHANICS_SCHEMA_VERSION = 1

MODEL_FEATURES_V1 = (
    "left_knee_flexion_deg",
    "right_knee_flexion_deg",
    "knee_flexion_asymmetry_deg",
    "left_hip_flexion_deg",
    "right_hip_flexion_deg",
    "hip_flexion_asymmetry_deg",
    "left_ankle_angle_deg",
    "right_ankle_angle_deg",
    "ankle_angle_asymmetry_deg",
    "pelvis_line_tilt_deg",
    "trunk_image_tilt_deg",
    "trunk_3d_tilt_deg",
    "left_knee_path_offset_pct",
    "right_knee_path_offset_pct",
    "ankle_separation_pct",
    "pelvis_depth_asymmetry_pct",
)


def _finite(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def _js_round(value: Any, digits: int = 3) -> float | None:
    """Match Math.round for the finite values used by the JS feature engine."""

    number = _finite(value)
    if number is None:
        return None
    factor = 10**digits
    return math.floor(number * factor + 0.5) / factor


def _point(landmarks: Sequence[Mapping[str, Any]] | None, index: int) -> Mapping[str, Any] | None:
    if not isinstance(landmarks, Sequence) or isinstance(landmarks, (str, bytes)):
        return None
    if index < 0 or index >= len(landmarks):
        return None
    value = landmarks[index]
    return value if isinstance(value, Mapping) else None


def _coordinate(point: Mapping[str, Any] | None, name: str) -> float:
    value = _finite(point.get(name) if point else None)
    return value if value is not None else 0.0


def _visible_point(
    landmarks: Sequence[Mapping[str, Any]] | None,
    index: int,
    minimum_visibility: float,
) -> bool:
    p = _point(landmarks, index)
    if p is None:
        return False
    x = _finite(p.get("x"))
    y = _finite(p.get("y"))
    z = p.get("z")
    if x is None or y is None:
        return False
    if z is not None and _finite(z) is None:
        return False
    visibility = _finite(p.get("visibility"))
    return (1.0 if visibility is None else visibility) >= minimum_visibility


def _visible(
    landmarks: Sequence[Mapping[str, Any]] | None,
    indices: Iterable[int],
    minimum_visibility: float,
) -> bool:
    return all(_visible_point(landmarks, index, minimum_visibility) for index in indices)


def _vector(a: Mapping[str, Any] | None, b: Mapping[str, Any] | None) -> tuple[float, float, float]:
    return (
        _coordinate(b, "x") - _coordinate(a, "x"),
        _coordinate(b, "y") - _coordinate(a, "y"),
        _coordinate(b, "z") - _coordinate(a, "z"),
    )


def _distance3d(a: Mapping[str, Any] | None, b: Mapping[str, Any] | None) -> float:
    x, y, z = _vector(a, b)
    return math.sqrt(x * x + y * y + z * z)


def _midpoint(a: Mapping[str, Any] | None, b: Mapping[str, Any] | None) -> dict[str, float]:
    return {
        "x": (_coordinate(a, "x") + _coordinate(b, "x")) / 2,
        "y": (_coordinate(a, "y") + _coordinate(b, "y")) / 2,
        "z": (_coordinate(a, "z") + _coordinate(b, "z")) / 2,
    }


def angle_degrees(
    a: Mapping[str, Any] | None,
    b: Mapping[str, Any] | None,
    c: Mapping[str, Any] | None,
) -> float | None:
    if a is None or b is None or c is None:
        return None
    bax, bay, baz = _vector(b, a)
    bcx, bcy, bcz = _vector(b, c)
    dot = bax * bcx + bay * bcy + baz * bcz
    magnitude = math.sqrt(bax * bax + bay * bay + baz * baz) * math.sqrt(
        bcx * bcx + bcy * bcy + bcz * bcz
    )
    if not magnitude:
        return None
    return math.acos(_clamp(dot / magnitude, -1.0, 1.0)) * 180 / math.pi


def _joint_angle(
    landmarks: Sequence[Mapping[str, Any]],
    indices: tuple[int, int, int],
    minimum_visibility: float,
) -> float | None:
    if not _visible(landmarks, indices, minimum_visibility):
        return None
    return angle_degrees(
        _point(landmarks, indices[0]),
        _point(landmarks, indices[1]),
        _point(landmarks, indices[2]),
    )


def _flexion_angle(
    landmarks: Sequence[Mapping[str, Any]],
    indices: tuple[int, int, int],
    minimum_visibility: float,
) -> float | None:
    internal = _joint_angle(landmarks, indices, minimum_visibility)
    return None if internal is None else _clamp(180 - internal, 0, 180)


def _torso_scale(
    landmarks: Sequence[Mapping[str, Any]],
    minimum_visibility: float,
) -> float | None:
    if not _visible(landmarks, (11, 12, 23, 24), minimum_visibility):
        return None
    shoulders = _midpoint(_point(landmarks, 11), _point(landmarks, 12))
    hips = _midpoint(_point(landmarks, 23), _point(landmarks, 24))
    return max(0.001, _distance3d(shoulders, hips))


def _signed_line_angle_from_horizontal(
    a: Mapping[str, Any] | None,
    b: Mapping[str, Any] | None,
) -> float | None:
    if a is None or b is None:
        return None
    return math.atan2(_coordinate(b, "y") - _coordinate(a, "y"), _coordinate(b, "x") - _coordinate(a, "x")) * 180 / math.pi


def _signed_trunk_tilt_from_image_vertical(
    hip_mid: Mapping[str, Any] | None,
    shoulder_mid: Mapping[str, Any] | None,
) -> float | None:
    if hip_mid is None or shoulder_mid is None:
        return None
    dx = _coordinate(shoulder_mid, "x") - _coordinate(hip_mid, "x")
    upward = _coordinate(hip_mid, "y") - _coordinate(shoulder_mid, "y")
    if not dx and not upward:
        return None
    return math.atan2(dx, upward) * 180 / math.pi


def _trunk_tilt3d(
    hip_mid: Mapping[str, Any] | None,
    shoulder_mid: Mapping[str, Any] | None,
) -> float | None:
    if hip_mid is None or shoulder_mid is None:
        return None
    dx = _coordinate(shoulder_mid, "x") - _coordinate(hip_mid, "x")
    dy = _coordinate(shoulder_mid, "y") - _coordinate(hip_mid, "y")
    dz = _coordinate(shoulder_mid, "z") - _coordinate(hip_mid, "z")
    horizontal = math.hypot(dx, dz)
    if not horizontal and not dy:
        return None
    return math.atan2(horizontal, abs(dy)) * 180 / math.pi


def _knee_path_offset_pct(
    landmarks: Sequence[Mapping[str, Any]],
    hip_index: int,
    knee_index: int,
    ankle_index: int,
    scale: float | None,
    minimum_visibility: float,
) -> float | None:
    if not scale or not _visible(landmarks, (hip_index, knee_index, ankle_index), minimum_visibility):
        return None
    hip = _point(landmarks, hip_index)
    knee = _point(landmarks, knee_index)
    ankle = _point(landmarks, ankle_index)
    denominator = _coordinate(ankle, "y") - _coordinate(hip, "y")
    t = 0.5 if abs(denominator) < 1e-6 else _clamp(
        (_coordinate(knee, "y") - _coordinate(hip, "y")) / denominator,
        0,
        1,
    )
    expected_x = _coordinate(hip, "x") + (_coordinate(ankle, "x") - _coordinate(hip, "x")) * t
    return (_coordinate(knee, "x") - expected_x) / scale * 100


def _visibility_summary(
    landmarks: Sequence[Mapping[str, Any]],
    indices: Iterable[int],
) -> tuple[float | None, float | None]:
    values = [
        value
        for index in indices
        if (value := _finite((_point(landmarks, index) or {}).get("visibility"))) is not None
    ]
    if not values:
        return None, None
    return sum(values) / len(values), min(values)


def _asymmetry(left: float | None, right: float | None) -> float | None:
    return abs(left - right) if left is not None and right is not None else None


def extract_biomechanics_frame(
    *,
    image_landmarks: Sequence[Mapping[str, Any]] | None,
    world_landmarks: Sequence[Mapping[str, Any]] | None = None,
    timestamp_ms: float | int | None = None,
    minimum_visibility: float = 0.55,
) -> dict[str, Any] | None:
    if not isinstance(image_landmarks, Sequence) or len(image_landmarks) < 33:
        return None

    angle_landmarks = (
        world_landmarks
        if isinstance(world_landmarks, Sequence) and len(world_landmarks) >= 33
        else image_landmarks
    )
    image_scale = _torso_scale(image_landmarks, minimum_visibility)
    world_scale = _torso_scale(angle_landmarks, minimum_visibility)

    left_knee_flexion = _flexion_angle(angle_landmarks, (23, 25, 27), minimum_visibility)
    right_knee_flexion = _flexion_angle(angle_landmarks, (24, 26, 28), minimum_visibility)
    left_hip_flexion = _flexion_angle(angle_landmarks, (11, 23, 25), minimum_visibility)
    right_hip_flexion = _flexion_angle(angle_landmarks, (12, 24, 26), minimum_visibility)
    left_ankle = _joint_angle(angle_landmarks, (25, 27, 31), minimum_visibility)
    right_ankle = _joint_angle(angle_landmarks, (26, 28, 32), minimum_visibility)

    has_torso_image = _visible(image_landmarks, (11, 12, 23, 24), minimum_visibility)
    image_shoulder_mid = _midpoint(_point(image_landmarks, 11), _point(image_landmarks, 12)) if has_torso_image else None
    image_hip_mid = _midpoint(_point(image_landmarks, 23), _point(image_landmarks, 24)) if has_torso_image else None

    has_torso_world = _visible(angle_landmarks, (11, 12, 23, 24), minimum_visibility)
    world_shoulder_mid = _midpoint(_point(angle_landmarks, 11), _point(angle_landmarks, 12)) if has_torso_world else None
    world_hip_mid = _midpoint(_point(angle_landmarks, 23), _point(angle_landmarks, 24)) if has_torso_world else None

    pelvis_line_tilt = (
        _signed_line_angle_from_horizontal(_point(image_landmarks, 23), _point(image_landmarks, 24))
        if _visible(image_landmarks, (23, 24), minimum_visibility)
        else None
    )
    trunk_image_tilt = _signed_trunk_tilt_from_image_vertical(image_hip_mid, image_shoulder_mid)
    trunk_3d_tilt = _trunk_tilt3d(world_hip_mid, world_shoulder_mid)

    ankle_separation = (
        abs(_coordinate(_point(image_landmarks, 27), "x") - _coordinate(_point(image_landmarks, 28), "x"))
        / image_scale
        * 100
        if image_scale and _visible(image_landmarks, (27, 28), minimum_visibility)
        else None
    )

    pelvis_depth_asymmetry = (
        abs(_coordinate(_point(angle_landmarks, 23), "z") - _coordinate(_point(angle_landmarks, 24), "z"))
        / world_scale
        * 100
        if world_scale and _visible(angle_landmarks, (23, 24), minimum_visibility)
        else None
    )

    mean_visibility, min_visibility = _visibility_summary(
        image_landmarks,
        (11, 12, 23, 24, 25, 26, 27, 28, 31, 32),
    )

    features = {
        "left_knee_flexion_deg": left_knee_flexion,
        "right_knee_flexion_deg": right_knee_flexion,
        "knee_flexion_asymmetry_deg": _asymmetry(left_knee_flexion, right_knee_flexion),
        "left_hip_flexion_deg": left_hip_flexion,
        "right_hip_flexion_deg": right_hip_flexion,
        "hip_flexion_asymmetry_deg": _asymmetry(left_hip_flexion, right_hip_flexion),
        "left_ankle_angle_deg": left_ankle,
        "right_ankle_angle_deg": right_ankle,
        "ankle_angle_asymmetry_deg": _asymmetry(left_ankle, right_ankle),
        "pelvis_line_tilt_deg": pelvis_line_tilt,
        "trunk_image_tilt_deg": trunk_image_tilt,
        "trunk_3d_tilt_deg": trunk_3d_tilt,
        "left_knee_path_offset_pct": _knee_path_offset_pct(
            image_landmarks, 23, 25, 27, image_scale, minimum_visibility
        ),
        "right_knee_path_offset_pct": _knee_path_offset_pct(
            image_landmarks, 24, 26, 28, image_scale, minimum_visibility
        ),
        "ankle_separation_pct": ankle_separation,
        "pelvis_depth_asymmetry_pct": pelvis_depth_asymmetry,
    }

    return {
        "schemaVersion": BIOMECHANICS_SCHEMA_VERSION,
        "timestampMs": _finite(timestamp_ms),
        "quality": {
            "meanVisibility": _js_round(mean_visibility),
            "minVisibility": _js_round(min_visibility),
            "usable": mean_visibility is not None and mean_visibility >= minimum_visibility,
        },
        "features": {name: _js_round(value) for name, value in features.items()},
    }


@dataclass
class _RunningStat:
    count: int = 0
    total: float = 0.0
    minimum: float = math.inf
    maximum: float = -math.inf
    first: float | None = None
    last: float | None = None

    def add(self, value: Any) -> None:
        number = _finite(value)
        if number is None:
            return
        self.count += 1
        self.total += number
        self.minimum = min(self.minimum, number)
        self.maximum = max(self.maximum, number)
        if self.first is None:
            self.first = number
        self.last = number

    def finish(self) -> dict[str, Any] | None:
        if not self.count:
            return None
        return {
            "samples": self.count,
            "min": _js_round(self.minimum),
            "max": _js_round(self.maximum),
            "mean": _js_round(self.total / self.count),
            "range": _js_round(self.maximum - self.minimum),
            "start": _js_round(self.first),
            "end": _js_round(self.last),
            "delta": _js_round((self.last or 0) - (self.first or 0)),
        }


@dataclass
class VideoBiomechanicsAccumulator:
    total_frames: int = 0
    pose_frames: int = 0
    usable_frames: int = 0
    visibility_total: float = 0.0
    visibility_count: int = 0
    minimum_visibility: float = math.inf
    stats: dict[str, _RunningStat] = field(default_factory=dict)

    def observe_sample(self) -> None:
        self.total_frames += 1

    def observe_pose_frame(self, frame: Mapping[str, Any] | None) -> None:
        if frame is None:
            return
        self.pose_frames += 1
        quality = frame.get("quality") or {}
        if quality.get("usable"):
            self.usable_frames += 1
        mean_visibility = _finite(quality.get("meanVisibility"))
        if mean_visibility is not None:
            self.visibility_total += mean_visibility
            self.visibility_count += 1
        min_visibility = _finite(quality.get("minVisibility"))
        if min_visibility is not None:
            self.minimum_visibility = min(self.minimum_visibility, min_visibility)

        for name, value in (frame.get("features") or {}).items():
            if _finite(value) is None:
                continue
            self.stats.setdefault(name, _RunningStat()).add(value)

    def finish(self) -> dict[str, Any]:
        features: dict[str, Any] = {}
        for name, stat in self.stats.items():
            value = stat.finish()
            if value is not None:
                features[name] = value
        return {
            "schemaVersion": BIOMECHANICS_SCHEMA_VERSION,
            "totalFrames": self.total_frames,
            "poseFrames": self.pose_frames,
            "usableFrames": self.usable_frames,
            "poseDetectionRate": _js_round(self.pose_frames / self.total_frames) if self.total_frames else None,
            "coverage": _js_round(self.usable_frames / self.total_frames) if self.total_frames else None,
            "quality": {
                "meanVisibility": _js_round(self.visibility_total / self.visibility_count)
                if self.visibility_count
                else None,
                "minVisibility": _js_round(self.minimum_visibility)
                if math.isfinite(self.minimum_visibility)
                else None,
            },
            "features": features,
        }


def flatten_training_row(summary: Mapping[str, Any]) -> dict[str, Any]:
    """Flatten a video summary into canonical model features plus audit columns."""

    features = summary.get("features") or {}
    row: dict[str, Any] = {
        "biomechanics_schema_version": summary.get("schemaVersion"),
        "sampled_frames": summary.get("totalFrames"),
        "pose_frames": summary.get("poseFrames"),
        "usable_frames": summary.get("usableFrames"),
        "pose_detection_rate": summary.get("poseDetectionRate"),
        "tracking_coverage": summary.get("coverage"),
        "mean_visibility": (summary.get("quality") or {}).get("meanVisibility"),
        "min_visibility": (summary.get("quality") or {}).get("minVisibility"),
    }
    for name in MODEL_FEATURES_V1:
        feature = features.get(name) or {}
        row[name] = feature.get("mean")
        row[f"{name}__min"] = feature.get("min")
        row[f"{name}__max"] = feature.get("max")
        row[f"{name}__range"] = feature.get("range")
    return row
