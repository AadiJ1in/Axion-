#!/usr/bin/env python3
"""Verify AxionWBF research-shadow bundle integrity before deployment."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import joblib


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--bundle-dir", required=True, type=Path)
    return p.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def main():
    args = parse_args()
    manifest_path = args.bundle_dir / "manifest.json"
    require(manifest_path.exists(), "manifest.json missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    require(manifest.get("bundleType") == "axionwbf_research_shadow", "Unexpected bundle type")
    require(manifest.get("clinicalStatus") == "research_only_not_clinically_validated", "Unexpected bundle clinicalStatus")
    require(manifest.get("readinessPolicy") == "eligible_for_research_shadow_mode_only", "Bundle is not shadow-release eligible")

    for name, block in (manifest.get("files") or {}).items():
        path = args.bundle_dir / str(block.get("filename") or "")
        require(path.exists(), f"Bundle file missing: {name}")
        require(path.stat().st_size == int(block.get("bytes") or -1), f"Bundle file size mismatch: {name}")
        require(sha256(path) == block.get("sha256"), f"Bundle SHA-256 mismatch: {name}")

    model_path = args.bundle_dir / manifest["files"]["model"]["filename"]
    evaluation_path = args.bundle_dir / manifest["files"]["evaluation"]["filename"]
    readiness_path = args.bundle_dir / manifest["files"]["readiness"]["filename"]
    model = joblib.load(model_path)
    evaluation = json.loads(evaluation_path.read_text(encoding="utf-8"))
    readiness = json.loads(readiness_path.read_text(encoding="utf-8"))

    require(model.get("modelVersion") == manifest.get("modelVersion") == evaluation.get("modelVersion"), "Model version mismatch")
    require(model.get("fingerprintSchemaVersion") == manifest.get("fingerprintSchemaVersion") == evaluation.get("fingerprintSchemaVersion"), "Fingerprint schema mismatch")
    require((readiness.get("observed") or {}).get("fingerprintSchemaVersion") == manifest.get("fingerprintSchemaVersion"), "Readiness schema mismatch")
    require(readiness.get("eligible") is True, "Readiness decision is not eligible")
    require((model.get("trainingFeatureReference") or {}).get("status") == "available", "Training reference unavailable")
    requirements = model.get("inferenceRequirements") or {}
    require(requirements.get("researchModelEligibleSessionRequired") is True, "Live eligibility gate not required")
    require(requirements.get("trainingDistributionReferenceRequired") is True, "OOD reference gate not required")
    require(model.get("model") is not None, "Serialized estimator missing")
    require(len(model.get("featureOrder") or []) == int(manifest.get("featureCount") or -1), "Feature-count mismatch")

    print(json.dumps({
        "status": "verified",
        "bundleType": manifest["bundleType"],
        "modelVersion": manifest["modelVersion"],
        "fingerprintSchemaVersion": manifest["fingerprintSchemaVersion"],
        "featureCount": manifest["featureCount"],
        "clinicalStatus": manifest["clinicalStatus"],
    }, indent=2))


if __name__ == "__main__":
    main()
