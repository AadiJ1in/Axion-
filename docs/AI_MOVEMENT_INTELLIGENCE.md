# Axion Movement Intelligence v0.2

## Implemented product architecture

Axion now has three separate layers. Keeping these layers separate is important for validation.

1. **On-device pose AI** — MediaPipe Pose Landmarker estimates body landmarks from the live camera stream.
2. **Canonical biomechanics** — `src/biomechanics.js` converts those landmarks into derived measurements such as knee/hip flexion, ankle angles, trunk and pelvis geometry, side-to-side differences, knee-path offsets, and tracking-quality metadata.
3. **Adaptive Movement Signature** — `src/movement-intelligence.js` learns a patient-specific pattern from high-quality repetitions and compares later repetitions and later compatible sessions with that derived signature.

The first adaptive Movement Signature is enabled for **bodyweight squat**.

## What changed from v0.1

v0.2 no longer maintains a second set of squat geometry formulas. It consumes the same per-repetition biomechanics object that Axion already persists and that the research movement-quality pipeline uses.

That gives Axion one measurement schema for:
- live patient sessions,
- session reports,
- longitudinal comparison,
- future clinician validation,
- public-dataset model development.

## Quality gating

The adaptive model does not learn from every counted repetition automatically.

A repetition must have sufficient:
- usable-frame coverage,
- mean landmark visibility,
- feature completeness,
- combined confidence.

Low-quality repetitions can still remain part of the prescribed exercise record, but they are excluded from AI baseline learning and pattern comparison.

## Robust baseline learning

The first three high-quality repetitions are used to attempt a session baseline.

Axion builds the baseline with robust medians and median absolute deviation rather than simple means. If the first repetitions vary too much, Axion extends baseline collection up to five high-quality repetitions.

If a repeatable baseline still cannot be established, the system reports that limitation and does **not** manufacture a movement-pattern comparison.

## Within-session comparison

After the baseline is ready, later high-quality repetitions are compared with it.

The product reports:
- tracking confidence,
- baseline cohesion,
- movement-signature similarity,
- a descriptive pattern band,
- the largest contributing derived movement features.

Similarity means only similarity to the measured reference pattern. It is not a score for recovery, technique quality, pathology, or injury risk.

## Longitudinal comparison

At the end of the session, Axion stores a compact derived Movement Signature containing feature centers and robust scales. It does not store raw video or raw landmark coordinates as part of this feature.

When the patient starts a later compatible squat session, Axion can load the latest compatible stored signature and compare the new session with it.

The movement report explicitly separates:
- **within-session similarity** — comparison with today's baseline,
- **longitudinal similarity** — comparison with the prior compatible session.

The report also displays the largest derived feature shifts without assigning a medical cause.

## Safety and claim boundary

This feature is **experimental movement analysis**, not a diagnostic or injury-prediction system.

It does not infer:
- pathology,
- weakness,
- pain source,
- tissue damage,
- reinjury probability,
- readiness to return to sport,
- treatment changes.

Recommended external wording:

> Axion uses on-device AI pose estimation and adaptive movement analysis to build patient-specific Movement Signatures and identify measurable changes in exercise mechanics across repetitions and sessions.

Do not describe this release as clinically validated AI, an injury predictor, or an autonomous physical therapist.

## Privacy boundary

The adaptive layer operates on derived biomechanics. The stored Movement Signature contains aggregate derived feature centers/scales and quality metadata, not images, video frames, or raw pose coordinates.

## Public-dataset research track

A separate research pipeline now exists for movement-quality modeling using the same canonical biomechanics schema. The current public-data target documented in `docs/MOBIPHYSIO_TRAINING_PIPELINE.md` is MobiPhysio.

That research model is intentionally separate from the patient-facing adaptive Movement Signature. A public-dataset score should not be enabled in clinical-facing product surfaces until its dataset terms, grouped evaluation, exercise/view performance, measurement validity, and intended meaning are reviewed.

## Next validation steps

1. Compare Axion-derived joint and trunk measurements with reference measurement and clinician annotation.
2. Measure repeatability across camera positions, lighting, clothing, devices, and body types.
3. Quantify how often quality gating appropriately suppresses unreliable comparisons.
4. Have PT/biomechanics collaborators independently annotate movement changes and compare agreement.
5. Freeze a versioned feature schema and model before prospective evaluation.
6. Prospectively test whether longitudinal Movement Signatures improve therapist review without increasing false-alert burden.
