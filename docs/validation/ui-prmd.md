# UI-PRMD external kinematic benchmark

## Purpose

This benchmark tests whether Axion's `whole-body-world-v2` kinematic feature extraction behaves consistently on an external rehabilitation-movement dataset.

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

The adapter maps the UI-PRMD Kinect skeleton into only the MediaPipe-style landmarks required by Axion's current whole-body feature extractor.

The mapping is a **skeletal-topology proxy**, not an assertion that the two skeleton definitions are anatomically identical. The benchmark result therefore must be interpreted as external kinematic robustness evidence.

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

For each episode, Axion reconstructs the Kinect skeleton, maps it into the subset of landmarks used by `extractWholeBodyBiomechanics`, and summarizes:

- left/right knee flexion
- 3D knee-flexion asymmetry
- 3D trunk–pelvis lateral deviation
- 3D shoulder–pelvis axis mismatch
- 3D hip-flexion asymmetry
- 3D mediolateral knee-offset proxies
- 3D pelvis-over-stance offset proxy

Each metric is summarized using frame coverage, p10, median, p90, robust excursion (`p90 - p10`), minimum, and maximum.

## Claims this benchmark can support

With enough UI-PRMD episodes, this benchmark can support engineering statements such as:

- Axion can parse and reconstruct an independent rehabilitation-motion dataset.
- Axion's world-v2 features can be computed across external squat, sit-to-stand, and lunge recordings.
- Feature coverage, scale, and repetition-to-repetition variability can be measured outside Axion's own capture pipeline.
- Coordinate-invariant features can be stress-tested against external motion-capture trajectories.

## Claims this benchmark cannot support

Do not use UI-PRMD results alone to claim:

- Compensation Migration is clinically validated.
- Axion predicts injuries or reinjury.
- A movement-drift threshold is clinically abnormal.
- A detected compensation causes symptoms or future injury.
- Webcam-derived proxies equal force-plate, inverse-dynamics, joint-moment, or tissue-load measurements.

UI-PRMD primarily contains healthy-subject movement data. Its value to Axion at this stage is external **kinematic benchmark validation**, not outcome validation.

## Next validation layers

1. Run the full UI-PRMD Kinect benchmark and quantify subject/repetition variability for m01 and m05.
2. Add Vicon-side comparison for features that can be mapped reproducibly between the Vicon marker model and Kinect skeleton.
3. Use a supervised rehabilitation dataset with correctness/clinician labels only under compatible licensing.
4. Collect clinician-reviewed Axion longitudinal sessions and explicit supported/not-supported/uncertain compensation labels.
5. Only after prospective outcome data exist, evaluate whether any longitudinal signal predicts clinically meaningful outcomes.
