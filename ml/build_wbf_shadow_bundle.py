#!/usr/bin/env python3
"""Build an integrity-bound AxionWBF research-shadow model bundle.

A bundle is created only when the supplied release-readiness artifact explicitly permits
research shadow mode and the serialized model is internally consistent with the
training/evaluation report. SHA-256 hashes bind the exact model, evaluation report, and
readiness decision together so deployment cannot silently mix versions.

This is an engineering integrity mechanism, not a cryptographic signature and not
clinical validation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

import joblib


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True, type=Path)
    p.add_argument("--evaluation", required=True, type=Path)
    p.add_argument("--readiness", required=True, type=Path)
    p.add_argument("--output-dir", required=True, type=Path)
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
    evaluation = json.loads(args.evaluation.read_text(encoding="utf-8"))
    readiness = json.loads(args.readiness.read_text(encoding="utf-8"))
    model_artifact = joblib.load(args.model)

    require(readiness.get("eligible") is True, "Readiness artifact is not eligible")
    require(readiness.get("mode") == "research_shadow", "Only research_shadow bundles are supported")
    require(readiness.get("policy") == "eligible_for_research_shadow_mode_only", "Unexpected readiness policy")
    require(model_artifact.get("clinicalStatus") == "research_only_not_clinically_validated", "Unexpected model clinicalStatus")
    require(evaluation.get("clinicalStatus") == "research_only_not_clinically_validated", "Unexpected evaluation clinicalStatus")

    model_schema = model_artifact.get("fingerprintSchemaVersion")
    evaluation_schema = evaluation.get("fingerprintSchemaVersion")
    readiness_schema = (readiness.get("observed") or {}).get("fingerprintSchemaVersion")
    require(model_schema is not None and model_schema == evaluation_schema == readiness_schema,
            f"Fingerprint schema mismatch: model={model_schema}, evaluation={evaluation_schema}, readiness={readiness_schema}")
    require(model_artifact.get("modelVersion") == evaluation.get("modelVersion"), "Model version does not match evaluation report")

    reference = model_artifact.get("trainingFeatureReference") or {}
    require(reference.get("status") == "available", "Training-distribution reference is required")
    requirements = model_artifact.get("inferenceRequirements") or {}
    require(requirements.get("trainingDistributionReferenceRequired") is True,
            "Model must fail closed when training-distribution reference is unavailable")
    require(requirements.get("researchModelEligibleSessionRequired") is True,
            "Model must require live research-model eligibility")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    destinations = {
        "model": args.output_dir / "wbf-model.joblib",
        "evaluation": args.output_dir / "evaluation.json",
        "readiness": args.output_dir / "readiness.json",
    }
    shutil.copy2(args.model, destinations["model"])
    shutil.copy2(args.evaluation, destinations["evaluation"])
    shutil.copy2(args.readiness, destinations["readiness"])

    manifest = {
        "schemaVersion": 1,
        "bundleType": "axionwbf_research_shadow",
        "clinicalStatus": "research_only_not_clinically_validated",
        "modelVersion": model_artifact.get("modelVersion"),
        "fingerprintSchemaVersion": model_schema,
        "featureCount": len(model_artifact.get("featureOrder") or []),
        "selectedFeatureCount": len(model_artifact.get("selectedFeatureOrderAfterFoldSafeFilter") or []),
        "trainingReferenceFeatureFraction": reference.get("availableFeatureFraction"),
        "inferenceRequirements": requirements,
        "readinessPolicy": readiness.get("policy"),
        "files": {
            name: {
                "filename": path.name,
                "sha256": sha256(path),
                "bytes": path.stat().st_size,
            }
            for name, path in destinations.items()
        },
        "interpretation": "Content-addressed engineering bundle for silent research-shadow evaluation only. SHA-256 verifies file integrity/version binding; it is not a digital signature, clinical validation, or regulatory clearance.",
    }
    manifest_path = args.output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "outputDir": str(args.output_dir),
        "modelVersion": manifest["modelVersion"],
        "fingerprintSchemaVersion": manifest["fingerprintSchemaVersion"],
        "manifestSha256": sha256(manifest_path),
    }, indent=2))


if __name__ == "__main__":
    main()
