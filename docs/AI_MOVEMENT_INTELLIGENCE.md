# Axion Movement Intelligence v0.1

## What is implemented

Axion now has two on-device movement-intelligence layers in the live rehabilitation workflow:

1. **AI pose estimation.** MediaPipe Pose Landmarker estimates body landmarks from the live camera feed in the browser.
2. **Adaptive movement modeling.** For supported exercises, Axion converts those landmarks into interpretable kinematic features and learns a patient-specific movement signature from the first three valid repetitions in the current session.

The first supported adaptive model is **bodyweight squat**.

For each valid squat repetition, the engine extracts:
- left/right knee excursion,
- left/right hip excursion,
- left/right ankle excursion,
- trunk position,
- knee and hip excursion symmetry,
- a frontal knee-spacing pattern,
- pose-estimation confidence.

After three baseline repetitions, subsequent repetitions are compared with that patient's own session baseline. The engine reports a descriptive pattern band (`stable`, `changed`, or `notable_change`), a 0–100 stability score, confidence, and the largest contributing movement-feature changes.

## Safety and claim boundary

This feature is **experimental movement analysis**, not a diagnostic or injury-prediction system.

It does not infer pathology, weakness, pain source, tissue damage, or readiness to return to sport. A larger pattern shift means only that the measured movement signature differed from the patient's earlier repetitions under the current camera/session conditions.

Recommended external wording:

> Axion uses on-device AI pose estimation and adaptive movement analysis to create patient-specific movement signatures and identify changes in exercise mechanics across repetitions.

Do not describe this release as "clinically validated AI," an injury predictor, or an autonomous physical therapist.

## Privacy boundary

Raw camera video is not added to the session record by this feature. Landmark-derived features are processed on device. The persisted session summary contains only aggregate movement-intelligence metadata such as model version, number of analyzed repetitions, average stability score, and latest pattern band.

## External supervised-model research

A supervised squat-quality experiment was reproduced on processed REHAB24-6 anatomical features. Using lower-extremity/trunk features and leave-one-subject-out evaluation over 98 squat repetitions from 9 usable subjects, the development reproduction produced approximately:

- ROC AUC: 0.84
- balanced accuracy: 0.77

These are **research-development results, not Axion clinical-performance metrics** and are not exposed as product claims.

The REHAB24-6 dataset is licensed for academic/nonprofit noncommercial research; commercial use requires permission from its owners. For that reason, weights trained on REHAB24-6 are intentionally **not embedded in the Axion product build**. The public-data work remains a validation/research track until commercial permission is obtained or a commercially usable/proprietary dataset is available.

Dataset: Černek et al., REHAB24-6, Zenodo DOI 10.5281/zenodo.13305826.

## Next validation steps

1. Verify Axion's camera-derived joint measurements against a reference measurement system.
2. Test repeatability across camera positions, lighting, clothing, body types, and devices.
3. Have physical therapists independently annotate repetitions and compare agreement.
4. Freeze a model version before prospective evaluation.
5. Only after those steps, study whether the output improves therapist review or patient outcomes.