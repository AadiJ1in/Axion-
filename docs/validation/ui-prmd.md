# UI-PRMD external kinematic benchmark

## Purpose

This benchmark tests whether Axion's canonical `biomechanics_v1` feature extraction behaves consistently on an external rehabilitation-movement dataset.

It is **not** clinical validation of Compensation Migration and it does not validate injury diagnosis, injury-risk prediction, patient outcomes, joint loading, tissue loading, or treatment decisions.

## Dataset

UI-PRMD (University of Idaho – Physical Rehabilitation Movement Data) contains rehabilitation movements recorded from 10 healthy subjects using both a Microsoft Kinect sensor and a Vicon optical motion-capture system.

Original data paper:

- Aleksandar Vakanski, Hyung-Pil Jun, David Paul, Russell Baker. "A Data Set of Human Body Movements for Physical Rehabilitation Exercises." *Data* 2018, 3(1), 2.
- DOI: https://doi.org/10.3390/data3010002
- Dataset license stated by the data paper: Open Data Commons Public Domain Dedication and License (PDDL) v1.0.

Relevant UI-PRMD movements for Axion:

| UI-PRMD | Movement | Axion use |
| --- | --- | --- |
| m01 | Deep squat | Bilateral lower-body external benchmark |
| m03 | Inline lunge | Research-only unilateral benchmark |
| m05 | Sit to stand | Bilateral lower-body external benchmark |

UI-PRMD Kinect segmented position and angle files contain 22 joints and 66 numeric values per frame (`22 × XYZ`) at approximately 30 Hz. Except for the waist/root, the stored positions are skeletal offsets. Axion reconstructs absolute Kinect skeleton positions using the published parent-chain transform order before computing biomechanics features.

## Adapter

Implementation:

- `scripts/validation/ui-prmd-adapter.mjs`
- `scripts/validation/ui-prmd-adapter-test.mjs`
- `scripts/validation/ui-prmd-benchmark.mjs`

The adapter maps the UI-PRMD Kinect skeleton into the MediaPipe-style landmark subset required by Axion's production `src/biomechanics.js` extractor. The benchmark deliberately uses that same extractor rather than a second validation-only biomechanics implementation.

The mapping is a **skeletal-topology proxy**, not an assertion that the Kinect and MediaPipe skeleton definitions are anatomically identical. Results therefore represent external engineering evidence about feature extraction and repeatability, not clinical validity.

No UI-PRMD files are committed to Axion and the benchmark does not download the dataset.

## Running the benchmark

Point `UI_PRMD_ROOT` at a local UI-PRMD directory containing segmented Kinect `*_positions.txt` and `*_angles.txt` files.

```bash
UI_PRMD_ROOT=/path/to/UI-PRMD npm run validation:ui-prmd
```

Optional JSON output:

```bash
UI_PRMD_ROOT=/path/to/UI-PRMD \
UI_PRMD_OUTPUT=/tmp/axion-ui-prmd.json \
npm run validation:ui-prmd
```

The saved JSON contains only derived benchmark summaries and relative source filenames. It does not include the local dataset root path or copy raw dataset frames.

## Current benchmark outputs

For each usable frame, Axion runs the canonical `extractBiomechanicsFrame` implementation and benchmarks the same camera-safer features currently eligible for longitudinal Compensation Migration review:

- knee-flexion asymmetry (`knee_flexion_asymmetry_deg`)
- 3D trunk tilt (`trunk_3d_tilt_deg`)
- hip-flexion asymmetry (`hip_flexion_asymmetry_deg`)
- ankle-angle asymmetry (`ankle_angle_asymmetry_deg`)
- pelvis-depth asymmetry (`pelvis_depth_asymmetry_pct`)

Each feature is summarized using frame coverage, p10, median, p90, robust excursion (`p90 - p10`), minimum, and maximum. Repeated episodes from the same subject can also produce within-subject median absolute deviation references.

These variability references are engineering repeatability references only. They are not abnormality thresholds and are not automatically used as clinical cutoffs.

## Claims this benchmark can support

With enough compatible UI-PRMD episodes, this benchmark can support engineering statements such as:

- Axion can parse and reconstruct an independent rehabilitation-motion dataset.
- Axion's production biomechanics-v1 features can be computed on external squat and sit-to-stand recordings.
- Feature coverage, scale, and repeated-episode variability can be quantified outside Axion's own webcam capture flow.
- The same feature implementation used by Axion sessions can be stress-tested on external motion trajectories.

## Claims this benchmark cannot support

Do not use UI-PRMD results alone to claim:

- Compensation Migration is clinically validated.
- Axion predicts injuries or reinjury.
- A movement-drift threshold is clinically abnormal.
- A detected compensation causes symptoms or future injury.
- Webcam-derived kinematics equal force-plate, inverse-dynamics, joint-moment, or tissue-load measurements.
- UI-PRMD Kinect-to-MediaPipe landmark adaptation proves measurement equivalence between hardware systems.

UI-PRMD primarily contains healthy-subject movement data. Its value to Axion at this stage is external **kinematic benchmarking and repeatability characterization**, not outcome validation.

## Next validation layers

1. Run the full UI-PRMD Kinect benchmark and quantify subject/repeated-episode variability for compatible bilateral movements.
2. Add Vicon-side comparison only for features that can be mapped reproducibly between the Vicon marker model and Axion's canonical features.
3. Use a supervised rehabilitation dataset with correctness or clinician labels only under compatible licensing and clearly defined label semantics.
4. Collect clinician-reviewed Axion longitudinal sessions with explicit supported / not-supported / uncertain compensation labels.
5. Compare webcam-derived kinematic features against laboratory reference measurements for measurement agreement before making stronger biomechanical claims.
6. Only after prospective outcome data exist, evaluate whether any longitudinal signal predicts clinically meaningful outcomes.
