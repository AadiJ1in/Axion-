# AxionWBF — Whole-Body Feature R&D Fork

## Purpose

AxionWBF is an isolated research branch for Axion's whole-body movement and compensation-migration work. The goal is to understand **how movement patterns redistribute across body regions over time** using a standard webcam and the same pose engine already used by Axion.

This work is intentionally isolated from production Axion until it passes technical, usability, and clinical validation gates.

## Current architecture

```text
camera / research video
        ↓
MediaPipe Pose (33 landmarks)
        ↓
existing Axion exercise tracker ──────────────→ valid reps / holds
        ↓
whole-body feature engine
        ↓
41 derived descriptive features
        ↓
rep summary + region capture quality
        ↓
session summary
        ↓
within-person same-exercise longitudinal analysis
        ↓
8-region body map + redistribution candidates
```

WBF does not store raw video or raw landmark coordinates in its feature summaries.

## Eight WBF regions

1. Head & neck
2. Left upper limb
3. Right upper limb
4. Trunk
5. Pelvis
6. Left lower limb
7. Right lower limb
8. Base of support

## Feature engine

`src/whole-body-biomechanics.js` builds on `src/biomechanics.js` instead of replacing it.

The first WBF schema contains 41 features spanning:

- head-line tilt and head/shoulder relationship
- shoulder flexion and bilateral shoulder asymmetry
- elbow flexion and bilateral elbow asymmetry
- wrist elevation and depth asymmetry
- shoulder and pelvis line tilt
- trunk 2D/3D tilt
- shoulder/pelvis counter-tilt
- shoulder/pelvis center offsets relative to the body/base
- hip, knee, and ankle angles
- bilateral hip/knee/ankle asymmetry
- frontal knee projection descriptors
- thigh frontal inclination
- knee-path offsets
- ankle separation / base-of-support geometry

Every frame also records per-region capture quality so downstream analysis can fail closed when important landmarks are not visible.

## Whole-body compensation graph

`src/whole-body-compensation.js` compares only:

- one identified patient
- the same exercise
- unique sessions
- quality-gated capture
- non-overlapping early and recent windows

The analysis uses the patient's own early sessions as a reference. Each feature is robustly normalized using median/MAD statistics rather than population clinical cutoffs.

A region change must persist across multiple recent sessions before it can become a redistribution candidate.

Example descriptive output:

```text
Pelvis deviation magnitude: decreased vs early reference
Trunk deviation magnitude: increased vs early reference

Candidate:
Pelvis → Trunk inverse region change
```

This is **not** interpreted as proof that mechanical load moved from the pelvis to the trunk. It is a longitudinal movement pattern for therapist review.

## Therapist UI

`src/whole-body-ui.js` and `src/whole-body-ui.css` provide an isolated reusable WBF component with:

- eight-region body map
- persistent increase/decrease/no-shift states
- strongest increase and decrease from the patient's early reference
- cross-region redistribution cards
- latest-session rep-to-rep drift
- explicit descriptive/unvalidated language

The component is not wired into the production Axion report yet. Integration should occur only after the WBF branch passes validation.

## Tracker adapter

`src/whole-body-tracker.js` observes the existing movement tracker rather than replacing its repetition logic.

WBF is not allowed to create or validate a clinical repetition. The existing Axion tracker remains authoritative for dose/rep completion; WBF only enriches completed movement with descriptive whole-body features.

## Public-data research pipeline

### Extraction

Use:

```bash
python ml/extract_wbf_dataset_features.py \
  --manifest datasets/mobiphysio/manifest.csv \
  --pose-model datasets/models/pose_landmarker.task \
  --output datasets/mobiphysio/wbf_features_v1.csv \
  --target-fps 12
```

The Python process performs MediaPipe inference. `ml/whole_body_landmarks_to_features.mjs` reduces landmarks immediately to derived WBF numbers and writes only those derived values to CSV.

### Training

Use:

```bash
python ml/train_wbf_movement_quality.py \
  --features-csv datasets/mobiphysio/wbf_features_v1.csv \
  --output public/models/wbf-movement-quality-v1.json \
  --target-column assessment_score \
  --group-column participant_id
```

The WBF trainer:

- splits by participant, not individual video
- uses grouped cross-validation
- quality-gates rows by feature and region coverage
- records held-out MAE/RMSE/R²
- records metrics by exercise and camera view
- emits a small browser-executable Ridge artifact

`src/whole-body-quality-model.js` executes that artifact in the browser.

## What public-data training can and cannot validate

MobiPhysio can help answer:

> Do WBF derived features contain useful signal for expert-rated movement quality?

It cannot establish:

- injury risk
- diagnosis
- tissue loading
- whether compensation caused another injury
- whether movement burden truly transferred between body regions
- whether a treatment should be changed

Those claims require longitudinal injured-patient data and clinician-reviewed labels.

## Compensation-migration validation dataset

The later clinical/research dataset should include repeated sessions per patient and exercise plus therapist-reviewed annotations such as:

- primary region of interest
- observed compensatory region(s)
- whether a cross-region change is clinically meaningful
- capture view / setup consistency
- affected / prescribed side
- stage of recovery
- therapist confidence
- pain/adverse-event context stored separately from movement features

Participant identity must remain grouped during train/test splitting.

## Safety language

Until prospective validation is complete, the product should use language such as:

- "observed movement change"
- "persistent region shift"
- "redistribution candidate"
- "therapist review suggested"

Avoid language such as:

- "injury predicted"
- "load transferred"
- "dangerous compensation"
- "secondary injury likely"
- "treatment should automatically change"

## CI gate

`.github/workflows/wbf-research.yml` runs:

- WBF JavaScript syntax checks
- WBF geometry tests
- longitudinal identity/persistence tests
- model runtime tests
- UI contract tests
- Python trainer syntax checks
- all existing Axion regression tests
- production build

## Standalone repository migration

The connected GitHub tool used in this ChatGPT session can edit existing repositories but cannot create a new repository. The current source of truth is therefore:

```text
AadiJ1in/Axion-
branch: axionwbf-prototype
```

When the empty `AadiJ1in/AxionWBF` repository exists, migrate this branch as the new repository's initial history or copy the branch tree directly. Keep Axion production and AxionWBF research deployments separate until the validation gates above are satisfied.

## Merge-back rule

Do not merge all of AxionWBF wholesale into Axion.

When WBF is ready, merge back in layers:

1. feature engine + tests
2. session persistence schema
3. therapist-only descriptive UI
4. longitudinal compensation graph
5. optional research model runtime
6. patient-facing use only after separate review and validation
