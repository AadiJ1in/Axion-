# Axion Public-Dataset Movement Model Pipeline

## Current scope

Axion's first public-data model learns **exercise-specific movement quality**, not injury risk.

The live product and the offline research pipeline now share the same biomechanics feature semantics. Browser features are implemented in `src/biomechanics.js`; the offline mirror is `ml/biomechanics_v1.py`. CI compares both implementations on the same synthetic poses so training cannot silently drift away from production geometry.

MobiPhysio is the first target dataset:

- DOI: https://doi.org/10.7910/DVN/XSI0QN
- 3,686 segmented smartphone videos
- 9 active-range-of-motion physiotherapy exercises
- 58 participants
- multiple camera views and recording perturbations
- expert EAAQ assessment scores scaled to 0–100

MobiPhysio is useful for movement-quality bootstrapping. It does **not** contain longitudinal injury outcomes and must not be used to claim validated injury prediction or Compensation Migration.

## Privacy and source-data rules

1. Keep source videos under a local ignored `datasets/` directory.
2. Do not commit source videos, extracted faces, raw frames, or raw landmarks.
3. Keep the downloaded MediaPipe model under `ml/models/`; task binaries are ignored.
4. The extraction CSV stores relative source filenames only for auditability plus derived numeric features.
5. Keep model outputs labeled research / not clinically validated until prospective validation is complete.

## 1. Install extraction dependencies

Use Python 3.12+.

```bash
python -m venv ml/.venv
source ml/.venv/bin/activate
python -m pip install -r ml/requirements-extraction.txt
```

The extraction environment pins MediaPipe separately from the training stack.

## 2. Download and verify the pose model

```bash
python ml/download_pose_model.py
```

The downloader verifies the exact SHA-256 used by Axion's browser tracker before saving the model. `ml/test_model_config_sync.py` prevents the browser and offline model identities from drifting apart.

## 3. Prepare a metadata CSV

The extractor is deliberately column-configurable because public-dataset metadata names can change between releases.

Canonical input:

```csv
video_path,participant_id,exercise_id,assessment_score,camera_view,source
P01/E01/front.mp4,P01,E01,82.4,front,expert
P01/E02/front.mp4,P01,E02,78.0,front,expert
```

Required information:

- relative video path
- participant/group identity
- exercise identity
- assessment score already scaled to 0–100

Optional camera-view/source fields are retained for later subgroup evaluation.

If the downloaded CSV uses different headers, pass `--video-column`, `--participant-column`, `--exercise-column`, `--score-column`, `--camera-view-column`, and/or `--source-column`.

## 4. Extract biomechanics locally

```bash
python ml/extract_mobiphysio_features.py \
  --videos-root datasets/mobiphysio/videos \
  --metadata-csv datasets/mobiphysio/metadata.csv \
  --output-csv datasets/mobiphysio/features_v1.csv
```

Default extraction behavior:

- samples video at 10 fps
- uses MediaPipe VIDEO mode with the same 0.55 tracking/detection confidence settings used by Axion
- allows up to two poses only so multi-person frames can be identified and excluded
- computes the Axion v1 biomechanics feature set
- stores per-video feature mean/min/max/range
- measures pose-detection rate, tracking coverage, visibility, and missing-feature rate
- marks each video `ok` or gives a rejection status

Important statuses include:

- `ok`
- `no_decodable_frames`
- `no_pose`
- `low_tracking_coverage`
- `too_many_missing_features`
- `error`

Rejected rows stay in the extraction file for auditing but are excluded by the trainer.

For a small smoke run:

```bash
python ml/extract_mobiphysio_features.py \
  --videos-root datasets/mobiphysio/videos \
  --metadata-csv datasets/mobiphysio/metadata.csv \
  --output-csv datasets/mobiphysio/features_smoke.csv \
  --max-videos 10
```

## 5. Install model-training dependencies

```bash
python -m pip install -r ml/requirements.txt
```

## 6. Train held-out participant models

```bash
python ml/train_movement_quality.py \
  --features-csv datasets/mobiphysio/features_v1.csv \
  --output ml/output/movement-quality-v1.json
```

The default artifact is an `exercise_ridge_bundle`, not one global model.

Why: MobiPhysio assessment uses exercise-specific EAAQs, so a knee/hip feature should not be interpreted through a different exercise's scoring rubric.

Training safeguards:

- one participant-level split is created before exercise models are fit
- the same held-out participants remain held out across exercises
- extraction-quality failures are filtered
- rows with excessive missing biomechanics are filtered
- duplicate source-video rows are rejected
- each exercise must have enough distinct training groups and test rows
- every model is compared against a mean-score baseline
- feature missing rates and held-out MAE/RMSE/R² are written into the artifact

The browser runtime refuses to score an exercise unless the model bundle contains that exact exercise ID.

## 7. Verify the pipeline

The dedicated `ML research checks` GitHub Actions workflow verifies:

- Python files compile
- JS/Python biomechanics outputs match
- browser/offline MediaPipe model URL and SHA-256 match
- MediaPipe/OpenCV imports work
- synthetic participant-grouped training produces separate exercise models without leakage

Local parity check:

```bash
python ml/test_biomechanics_parity.py
python ml/test_model_config_sync.py
python ml/test_training_pipeline.py
```

## Before any model reaches Axion UI

Do not enable a trained score in patient/therapist screens merely because training completed.

At minimum:

1. held-out participant MAE must materially beat the mean-score baseline
2. performance must be inspected separately by exercise
3. camera-view and recording-condition subgroup performance must be reviewed
4. low-visibility and missing-feature behavior must be inspected
5. an entirely independent recording set should be tested
6. PT/biomechanics collaborators should review what the score means
7. the UI must call it a research movement-quality score, not diagnosis, injury risk, or treatment advice

## Next research layer

After the public movement-quality model is functioning, the next dataset layer should include clinician-labeled compensation patterns and repeated longitudinal sessions. That is the data needed to develop Axion's Compensation Migration concept: detecting whether movement burden is shifting elsewhere in the kinetic chain over time.
