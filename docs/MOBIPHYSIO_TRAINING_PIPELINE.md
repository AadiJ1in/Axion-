# Axion Public-Dataset Movement Model Pipeline

## What this adds

Axion's first research AI should learn **movement quality**, not injury risk.

The live product already uses MediaPipe Pose. The new `src/biomechanics.js` layer converts pose landmarks into a stable set of derived movement features such as knee/hip flexion, side-to-side differences, trunk/pelvis geometry, knee-path offsets, and tracking quality. Raw video and raw landmark coordinates are not persisted by this feature layer.

The first public-data target is **MobiPhysio**:

- Data article: https://doi.org/10.1016/j.dib.2026.112635
- Original dataset: https://doi.org/10.7910/DVN/XSI0QN
- 3,686 segmented smartphone videos
- 9 active-range-of-motion physiotherapy exercises
- 58 participants
- front, left, and right views plus real-world recording variations
- expert-guided exercise assessment scores

MobiPhysio is useful for bootstrapping movement-quality assessment. It is **not** a longitudinal injured-patient dataset and cannot validate Axion's future Compensation Migration or injury-prediction claims.

## Safety and privacy rules

1. Keep public-dataset video files outside the Git repository.
2. Do not upload identifiable source videos to Axion production storage.
3. The MobiPhysio publication states that the released videos contain visible faces. Treat source videos as identifiable research data even though the dataset is public.
4. Persist only derived features needed for research/model development unless a separately approved protocol requires more.
5. Verify the dataset's current Dataverse terms before redistributing source data or derived artifacts.
6. A model trained here must remain labeled **research / not clinically validated** until prospective validation is complete.

## Canonical feature schema

The browser and future batch processor must use the same feature names defined in:

`src/biomechanics.js -> MODEL_FEATURES_V1`

The current v1 features are derived measurements, not diagnoses. In particular, camera-plane offsets must never be relabeled as clinical valgus/varus or injury risk without validation.

## Training table contract

Create one row per usable video/rep aggregate with at least:

- `participant_id`
- `exercise_id`
- `assessment_score`
- every feature in `MODEL_FEATURES_V1`

Optional columns can preserve camera angle, recording condition, gender category supplied by the dataset, and source filename for audit/debugging. Do not use the source filename itself as a model feature.

Example:

```csv
participant_id,exercise_id,assessment_score,left_knee_flexion_deg,right_knee_flexion_deg,...
P001,E07,87.3,74.1,75.8,...
```

## Why participant-level splitting matters

MobiPhysio contains multiple recordings of the same participant under different views/conditions. Randomly splitting individual videos can place the same person in both training and test data and inflate apparent performance.

`ml/train_movement_quality.py` therefore uses a **grouped split by participant** and grouped cross-validation.

## Train the first model

Use Python 3.12+.

```bash
python -m venv ml/.venv
source ml/.venv/bin/activate
pip install -r ml/requirements.txt

python ml/train_movement_quality.py \
  --features-csv datasets/mobiphysio/features_v1.csv \
  --output public/models/movement-quality-v1.json \
  --target-column assessment_score \
  --group-column participant_id \
  --exercise-column exercise_id
```

The output is a small JSON Ridge model that can be executed by `src/movement-quality-model.js` without shipping Python or scikit-learn to the browser.

The artifact includes held-out MAE/RMSE/R² and per-exercise metrics when exercise IDs are available.

## Do not ship a weak model

Before enabling a trained model in any patient-facing or therapist-facing screen:

1. Confirm participant-level test splitting.
2. Inspect performance separately by exercise and camera view.
3. Inspect missing-feature rate and low-visibility failures.
4. Test against recordings not used during model tuning.
5. Have PT/biomechanics collaborators review what the score actually means.
6. Keep the label as **movement-quality research score** rather than compensation, diagnosis, injury risk, or treatment advice.
7. Version the model artifact and feature schema together.

## What still needs to be built

The next data-engineering step is a batch runner that feeds MobiPhysio videos through the same MediaPipe + `biomechanics.js` logic and emits `features_v1.csv`.

After a public-data model works, Axion can add clinician-labeled and longitudinal patient datasets. That later dataset—not MobiPhysio alone—is what can be used to develop and validate Compensation Migration.
