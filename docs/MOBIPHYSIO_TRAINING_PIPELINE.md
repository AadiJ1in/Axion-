# Axion Public-Dataset Movement Model Pipeline

## Goal

Axion's first public-data AI should learn **movement quality**, not injury risk.

The live product already uses MediaPipe Pose. `src/biomechanics.js` converts pose landmarks into a stable set of derived movement features such as knee/hip flexion, side-to-side differences, trunk/pelvis geometry, knee-path offsets, and tracking quality. Raw video and raw landmark coordinates are not persisted by this feature layer.

The first public-data target is **MobiPhysio**:

- Data article: https://doi.org/10.1016/j.dib.2026.112635
- Original dataset: https://doi.org/10.7910/DVN/XSI0QN
- 3,686 segmented smartphone videos
- 9 active-range-of-motion physiotherapy exercises
- 58 participants
- front, left, and right views plus lighting, jitter, occlusion, and resolution variations
- expert-guided exercise assessment scores on a 0-100 scale

MobiPhysio is useful for bootstrapping movement-quality assessment. It is **not** a longitudinal injured-patient dataset and cannot validate Axion's future Compensation Migration or injury-prediction claims.

## Safety and privacy rules

1. Keep public-dataset video files outside the Git repository.
2. Do not upload identifiable source videos to Axion production storage.
3. The MobiPhysio publication states that the released videos contain visible faces. Treat source videos as identifiable research data even though the dataset is public.
4. Persist only derived features needed for research/model development unless a separately approved protocol requires more.
5. Verify the dataset's current Dataverse terms before redistributing source data or derived artifacts.
6. A model trained here must remain labeled **research / not clinically validated** until prospective validation is complete.

## Canonical feature schema

The browser and batch processor share the same feature implementation:

`src/biomechanics.js -> MODEL_FEATURES_V1`

The Python extractor performs MediaPipe inference, then streams landmark frames directly to `ml/landmarks_to_features.mjs`. That Node reducer calls the same JavaScript feature engine used by the app. It writes derived numbers only; landmark coordinates are never written to the feature CSV.

The current v1 features are descriptive measurements, not diagnoses. In particular, camera-plane offsets must never be relabeled as clinical valgus/varus or injury risk without validation.

## Local environment

Use Python 3.12 and Node 22 to match the supported project/runtime versions.

```bash
python3.12 -m venv ml/.venv
source ml/.venv/bin/activate
pip install -r ml/requirements.txt
npm ci
```

The extraction environment currently pins MediaPipe and OpenCV in `ml/requirements.txt` for reproducibility.

## Prepare a manifest

Start from `ml/manifest.example.csv`. Required fields are:

- `participant_id`
- `exercise_id`
- `assessment_score`
- `video_path`

Recommended fields are:

- `video_id` — stable unique identifier; if omitted Axion uses the resolved video path
- `camera_view`
- `recording_condition`
- `source_name`

Example:

```csv
video_id,participant_id,exercise_id,assessment_score,camera_view,recording_condition,source_name,video_path
E07-P001-F,P001,E07,87.3,front,full_light,E07_P001_F.mp4,./videos/E07_P001_F.mp4
```

The extractor rejects duplicate IDs, missing files, non-numeric scores, and scores outside 0-100 before starting inference.

## Extract canonical features from videos

Download a compatible MediaPipe `pose_landmarker.task` model locally. Do not commit the model or source dataset videos to this repository.

First validate the manifest and paths without changing files:

```bash
python ml/extract_dataset_features.py \
  --manifest datasets/mobiphysio/manifest.csv \
  --pose-model datasets/models/pose_landmarker.task \
  --output datasets/mobiphysio/features_v1.csv \
  --dry-run
```

Then run a small end-to-end smoke extraction:

```bash
python ml/extract_dataset_features.py \
  --manifest datasets/mobiphysio/manifest.csv \
  --pose-model datasets/models/pose_landmarker.task \
  --output datasets/mobiphysio/features_v1.csv \
  --target-fps 12 \
  --max-videos 10
```

If that succeeds, run the full dataset by removing `--max-videos`.

The extractor is resumable. Existing `video_id` rows in the output CSV are skipped on later runs. `--force` deliberately deletes the selected output/failure log before reprocessing so it cannot silently create duplicate training rows.

Failed source videos are written to a sibling `*.failures.csv` and do not terminate the entire dataset run. A failed video's partial landmark stream is discarded before the next video starts.

## Output feature table

The reducer writes one row per completed video with metadata, extraction quality, and every canonical model feature:

- `total_frames`
- `usable_frames`
- `frame_coverage`
- `mean_visibility`
- `min_visibility`
- `feature_coverage`
- every entry in `MODEL_FEATURES_V1`

Raw frame coordinates are not part of the output.

## Why participant-level splitting matters

MobiPhysio contains multiple recordings of the same participant under different views/conditions. Randomly splitting individual videos can place the same person in both training and test data and inflate apparent performance.

`ml/train_movement_quality.py` therefore uses a **grouped split by participant** and grouped cross-validation.

## Train the first model

```bash
python ml/train_movement_quality.py \
  --features-csv datasets/mobiphysio/features_v1.csv \
  --output public/models/movement-quality-v1.json \
  --target-column assessment_score \
  --group-column participant_id \
  --exercise-column exercise_id \
  --view-column camera_view \
  --min-feature-coverage 0.70
```

The trainer rejects duplicate `video_id` rows, rows below the feature-coverage threshold, target scores outside 0-100, and grouped splits that leave an entire model feature absent from training data.

The output is a small JSON Ridge model that can be executed by `src/movement-quality-model.js` without shipping Python or scikit-learn to the browser. The artifact records held-out MAE/RMSE/R², per-exercise metrics, per-camera-view metrics, excluded-row count, participant counts, and the chosen regularization value.

## Verification gates

The repository includes deterministic contracts for:

- feature geometry and visibility gating
- rep/session aggregation
- model runtime validation and missing-feature handling
- streaming landmark-to-feature conversion
- monotonic video timestamps
- Python pipeline syntax

These run independently of the source dataset, so dataset files never enter CI.

## Do not ship a weak model

Before enabling a trained model in any patient-facing or therapist-facing screen:

1. Confirm participant-level test splitting.
2. Inspect performance separately by exercise and camera view.
3. Inspect missing-feature rate and low-visibility failures.
4. Test against recordings not used during model tuning.
5. Check error distribution across expert/non-expert groups when that metadata is available.
6. Have PT/biomechanics collaborators review what the score actually means.
7. Keep the label as **movement-quality research score** rather than compensation, diagnosis, injury risk, or treatment advice.
8. Version the model artifact and feature schema together.

## Next clinical-data phase

After a public-data movement-quality model works, Axion can add clinician-labeled and longitudinal patient datasets. That later dataset—not MobiPhysio alone—is what can be used to develop and validate Compensation Migration, where Axion compares changing mechanical patterns across sessions and body regions over time.
