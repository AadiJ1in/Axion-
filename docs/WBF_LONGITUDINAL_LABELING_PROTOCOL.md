# AxionWBF longitudinal redistribution labeling protocol

## Purpose

Create external research labels for repeated-session movement-strategy redistribution without using AxionWBF's own rule outputs as ground truth. These labels are for research model development only and are not diagnoses, injury-risk labels, tissue-load measurements, or treatment recommendations.

## Core anti-circularity rule

A reviewer must **not** see any of the following before submitting the independent label:

- WBF redistribution candidate/status
- WBF evidence tier
- primary/outside movement percentages
- compositional ILR/CLR/log-balance values
- WBF model prediction
- destination-region prediction
- automated compensation wording

Reviewers may see the source evidence that would exist independently of WBF's redistribution rule, such as deidentified movement replay, clinically relevant exercise identity, prescribed side, standardized capture view, and session ordering.

## Unit of labeling

One row represents one longitudinal window for one participant and one exercise under a compatible capture protocol.

Minimum recommended research window:

- same participant
- same exercise/tracking signal
- same prescribed side
- same camera-view protocol
- same movement-intent schema
- at least 3 early-reference sessions and 3 recent sessions
- preferably 4+ early and 4+ recent sessions for a higher-stability label

## Independent reviewer fields

Each reviewer records:

- `participant_id` — pseudonymous research identifier
- `window_id`
- `reviewer_id` — pseudonymous reviewer identifier
- `redistribution_present` — `0`, `1`, or `uncertain`
- `confidence` — integer 1-5
- `source_region` — optional body-region category
- `destination_region` — optional body-region category
- `late_set_emergence` — `0`, `1`, or `uncertain`
- `laterality_change` — `0`, `1`, or `uncertain`
- `review_notes` — optional concise rationale

Allowed region vocabulary should match the versioned WBF regions:

- `head_neck`
- `left_upper_limb`
- `right_upper_limb`
- `trunk`
- `pelvis`
- `left_lower_limb`
- `right_lower_limb`
- `base_of_support`
- `none`
- `uncertain`

## Reviewer instructions

For `redistribution_present = 1`, the reviewer should observe a repeated-session change in movement strategy in which movement becomes relatively more expressed in one or more body regions while becoming relatively less expressed in the exercise's previously dominant movement pattern.

The reviewer should **not** infer force transfer, tissue loading, injury risk, pain mechanism, causation, or clinical harm from visual movement alone.

A label of `uncertain` is preferred over forcing a binary answer when capture quality, view, occlusion, session inconsistency, or ambiguity prevents a confident review.

## Blinded independent review

Recommended minimum:

1. Two qualified reviewers label every window independently.
2. Review order is randomized.
3. Reviewers are blinded to each other's labels.
4. Reviewers are blinded to WBF rule/model outputs.
5. Disagreements are adjudicated only after both independent labels are locked.
6. The model-training target uses the adjudicated label or a prespecified consensus rule.

For higher-quality validation, use three independent reviewers for a subset of windows.

## Agreement gates before training

Do not train the longitudinal classifier merely because labels exist. First report:

- raw percent agreement
- Cohen's kappa for two-reviewer binary labels
- positive agreement
- negative agreement
- disagreement count
- uncertain-label rate
- destination-region agreement among windows both reviewers mark positive

Suggested research workflow gate:

- investigate labeling protocol if kappa is poor or agreement is unstable
- do not hide uncertain or disagreed windows by silently relabeling them
- preserve the original independent labels alongside adjudication

No fixed kappa cutoff is declared as a clinical-validity threshold; the value must be interpreted with prevalence, sample size, reviewer composition, and the labeling task.

## Train/test leakage restrictions

All windows from a participant must stay in the same model partition.

If multiple overlapping longitudinal windows exist for one participant/exercise, they must never be split across train and test.

If the same raw sessions contribute to more than one window, all derived windows belong to the same participant/group partition.

## External validation

A deployable research model should be evaluated on a separately collected cohort not used for:

- feature design
- threshold design
- label-protocol tuning
- model-family selection
- hyperparameter selection

Validation should report performance by exercise, camera view, prescribed side, and relevant capture-quality strata.

## Claim boundary

Even a high-performing classifier trained under this protocol supports only the statement that the model can reproduce a prespecified human-reviewed movement-pattern label under the tested conditions. It does not by itself establish that the pattern represents mechanical load transfer, injury risk, diagnosis, treatment response, or clinical benefit.
