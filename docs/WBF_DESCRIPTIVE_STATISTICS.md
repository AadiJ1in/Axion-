# AxionWBF Descriptive Statistics Specification

## Purpose

AxionWBF asks a narrow research question:

> During a prescribed movement, where is observable body movement occurring, how does that distribution change through a repetition and set, and does the distribution change persistently across repeated same-exercise sessions for the same person?

The system is **descriptive and unvalidated**. It does not calculate tissue force, joint load, muscle activation, diagnosis, injury probability, clinical significance, or treatment recommendations.

## Analysis hierarchy

WBF calculates statistics at four levels:

1. **Frame** — derived pose geometry at a moment in time.
2. **Rep** — magnitude, variability, path, and timing of derived features throughout one valid rep.
3. **Session** — distribution and trends across valid reps.
4. **Longitudinal** — early-session reference versus recent same-exercise sessions for one patient under compatible capture and movement-intent context.

The existing Axion clinical tracker remains responsible for deciding whether a movement counts as a valid rep. WBF observes accepted rep windows and cannot independently create a rep.

---

## 1. Frame-derived whole-body features

`src/whole-body-biomechanics.js` produces 41 derived features across eight regions:

- head & neck
- left upper limb
- right upper limb
- trunk
- pelvis
- left lower limb
- right lower limb
- base of support

Examples include joint flexion, bilateral asymmetry, trunk/pelvis tilt, shoulder movement, wrist elevation, knee-path offsets, center offsets, and base-of-support descriptors.

Raw image/video pixels and raw landmark coordinate arrays are not part of persisted WBF summaries.

---

## 2. Robust within-repetition statistics

For a feature trajectory `x1...xn`, WBF records:

### Center

- mean
- median

Median is emphasized for movement summaries because occasional pose-estimation spikes can distort the arithmetic mean.

### Spread

- minimum
- maximum
- range = `max - min`
- sample standard deviation
- first quartile (`Q1`)
- third quartile (`Q3`)
- interquartile range (`IQR = Q3 - Q1`)
- median absolute deviation (`MAD = median(|xi - median(x)|)`)
- coefficient of variation when the mean is sufficiently far from zero

### Net change

- start value
- end value
- signed delta = `end - start`
- net displacement = `|end - start|`

Net change alone is not sufficient. A trajectory such as `0 → 10 → 0 → 10 → 0` has zero net displacement but substantial motion.

### Path statistics

For consecutive feature values:

`pathLength = Σ |xi - x(i-1)|`

WBF records:

- path length
- path-to-range ratio = `pathLength / range`
- directional efficiency = `netDisplacement / pathLength`
- mean absolute step
- median absolute step
- peak absolute step
- path rate per second = `pathLength / duration`

Interpretation:

- A path-to-range ratio near 1 is consistent with a mostly one-directional excursion and return definition can affect this value depending on the captured feature.
- A larger ratio means the feature traversed more total distance relative to its observed range.
- Low directional efficiency indicates the feature moved substantially but ended closer to its starting value.

These are movement descriptors, not instability or pathology labels.

### Velocity descriptors

From consecutive feature samples and timestamps:

`absolute velocity = |Δfeature| / Δtime`

WBF records:

- median absolute velocity per second
- 95th-percentile absolute velocity per second
- peak absolute velocity per second
- phase of peak velocity

These values depend on camera/model sampling quality and are not physical segment velocities in meters/second unless separately calibrated.

### Timing / phase descriptors

Rep phase is normalized from `0` at the start to `1` at the end.

WBF records:

- peak excursion from the starting value
- phase of peak excursion
- time to peak excursion
- first-half mean
- second-half mean
- second-half minus first-half mean
- phase of peak absolute velocity

This allows WBF to distinguish, for example, trunk motion occurring primarily near peak knee flexion from trunk motion distributed throughout the entire repetition.

---

## 3. Exercise movement-intent model

`src/whole-body-movement-intent.js` maps every Axion movement-profile signal to three descriptive categories:

### Primary regions

Regions most directly associated with the tracker signal for the exercise.

### Expected-support regions

Regions expected to participate in stabilization or normal movement context.

### Other observed regions

Regions outside the primary/support set.

This map is **not a clinical correctness map**. Motion in an “other” region is not automatically compensation, abnormal, inefficient, or harmful.

### Unilateral prescriptions

For a unilateral prescription, the working-side limb remains primary. The contralateral limb is moved to expected support rather than automatically classified as “other.” This prevents ordinary stabilization from becoming a false-positive redistribution signal.

All explicit Axion exercise movement profiles must resolve to a versioned WBF intent. CI fails if a new signal is added without an intent mapping.

---

## 4. Cross-feature normalization

Angles and normalized position offsets have different units. WBF therefore uses versioned **engineering normalization anchors** before combining them into region-level movement excursion.

For a feature:

`normalized feature excursion = observed feature range / feature normalization anchor`

The anchors are engineering scales used only to put heterogeneous descriptive features on comparable numerical ranges. They are **not clinical thresholds** and must not be presented as normative cutoffs.

For each region, WBF takes the median of available normalized feature excursions to reduce sensitivity to one unusually large feature.

---

## 5. Per-rep movement distribution

For every measured rep, region excursions are summed into:

- `P` = primary-region normalized excursion
- `S` = expected-support-region normalized excursion
- `O` = other-region normalized excursion
- `T = P + S + O`

WBF then calculates:

- primary movement share = `P / T`
- support movement share = `S / T`
- outside-region movement share = `O / T`
- outside-to-primary ratio = `O / P` when `P > 0`

These are **shares of normalized derived pose-feature excursion**. They are not percentages of force, joint loading, muscle activation, energy expenditure, or injury risk.

---

## 6. Session descriptive statistics

Across valid reps, WBF calculates for primary/support/outside shares and the outside-to-primary ratio:

- n
- mean
- median
- min/max
- range
- sample SD
- Q1/Q3
- IQR
- MAD
- CV when defined
- slope per rep

### Region contribution share

For each of the eight regions:

`region contribution = region normalized excursion / total normalized excursion`

The same descriptive statistics are calculated across reps.

### Bilateral redistribution indices

For paired left/right regions:

`LR index = (left excursion - right excursion) / (left excursion + right excursion)`

WBF calculates this for upper limbs and lower limbs when both are measurable.

The value is a normalized side-to-side movement-distribution descriptor, not a diagnosis of asymmetry.

### Early-versus-late set comparison

The session is divided into non-overlapping early and late windows. WBF records:

- early primary share
- late primary share
- primary-share change
- early outside share
- late outside share
- outside-share change

This identifies movement redistribution that becomes more visible as the set progresses.

### Primary-region coupling

For support/outside regions with enough measured reps, WBF calculates Spearman rank correlation between:

- total primary-region excursion per rep
- the region’s excursion per rep

A positive value means the region tends to increase when primary-region excursion increases. A negative value means it tends to decrease. Correlation does not establish causation or compensation.

### Movement concentration

WBF uses a Herfindahl-style concentration index:

`HHI = Σ share(region)^2`

Higher values mean observed excursion is numerically concentrated into fewer regions; lower values mean it is spread more evenly across measured regions.

### Distribution entropy

For non-zero region shares `pi`:

`H = -Σ pi ln(pi)`

Normalized entropy:

`Hnorm = H / ln(k)`

where `k` is the number of non-zero measured regions.

Normalized entropy approaches 0 when movement is highly concentrated and approaches 1 when the observed distribution is more even across regions.

Entropy is a distribution descriptor, not a quality score.

---

## 7. Longitudinal movement redistribution

WBF compares repeated sessions only when they belong to:

- one patient
- one exercise
- unique sessions
- compatible camera-view metadata when recorded
- compatible movement-distribution schema
- compatible movement-intent schema
- the same tracking signal
- the same prescribed side when recorded
- the same primary/support region definitions

Mixed context fails closed rather than being pooled.

### Early reference

By default, the first three quality-compatible sessions form the early reference window.

### Recent window

By default, the three most recent compatible sessions form the recent window.

The two windows are non-overlapping when the default six-session minimum is used.

### Robust baseline scaling

For a longitudinal metric:

1. baseline center = median of early sessions
2. baseline variability = MAD
3. robust scale = `max(engineering floor, 1.4826 × MAD)`
4. standardized shift = `(recent median - early median) / robust scale`

The floor prevents a nearly zero baseline MAD from turning trivial numerical changes into extremely large standardized values.

### Persistence

A single anomalous session cannot create a redistribution candidate.

Recent sessions must repeatedly move in the same direction relative to the early reference by at least half of the baseline robust scale before the feature is marked persistent.

### Longitudinal metrics

WBF compares:

- primary movement share
- support movement share
- outside-region movement share
- outside-to-primary ratio
- late-set outside-share change
- movement concentration index
- distribution entropy
- each individual region contribution share

### Descriptive redistribution research rule

A candidate currently requires:

- persistent outside-region share increase
- standardized outside-share shift ≥ +0.75
- persistent primary-share decrease
- standardized primary-share shift ≤ -0.75
- at least one persistent outside region with increased contribution

WBF then names the largest persistent outside-region increase as the **destination region**.

This rule means only:

> The person’s observable derived-pose movement became less concentrated in the exercise’s primary regions and more concentrated outside the primary/support set relative to that person’s own early-session reference.

It does **not** mean mechanical load transferred to that region.

---

## 8. Statistical fingerprint

`src/whole-body-statistical-fingerprint.js` flattens session-level WBF statistics into a versioned numeric feature vector for research.

It includes:

- primary/support/outside distribution summaries
- outside-to-primary ratio
- concentration and entropy
- bilateral redistribution
- early-to-late changes
- eight-region contribution statistics
- eight-region capture coverage
- region-aggregated range/SD/IQR/MAD
- path length and path-to-range ratio
- directional efficiency
- peak excursion and phase
- time to peak excursion
- half-rep change
- path rate
- peak velocity and phase
- feature slope
- primary-region coupling

It excludes:

- raw video
- image pixels
- raw landmarks
- patient identifiers
- diagnoses
- clinician treatment decisions

The schema must be versioned with any future model trained on it.

---

## 9. Required quality gates before interpretation

A WBF redistribution result should not be interpreted when:

- insufficient body regions are visible
- too few valid reps are measured
- too few same-exercise sessions exist
- patient identity is missing or mixed
- exercise identity is missing or mixed
- duplicate session records exist
- camera view changes across the longitudinal window
- prescribed side changes across the window
- movement-intent schemas differ
- distribution schemas differ
- primary/support definitions differ

Future validation should additionally study camera angle tolerance, clothing/occlusion, body-size diversity, device placement, exercise-specific reliability, intra-rater/inter-rater agreement with clinicians, test-retest reliability, and minimum detectable change.

---

## 10. Language boundaries

Until prospective clinical validation exists, preferred language is:

- “observed movement distribution”
- “outside-region movement share”
- “persistent change from the patient’s early reference”
- “redistribution candidate for therapist review”
- “movement became more/less concentrated in…”

Avoid unsupported claims such as:

- “mechanical burden shifted” as an established physical fact
- “the patient is compensating incorrectly”
- “secondary injury is developing”
- “this region is overloaded”
- “injury risk increased by X%”
- “the treatment should change”

Those claims would require different measurements and clinical validation.
