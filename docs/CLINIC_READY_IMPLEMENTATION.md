# Clinic-ready rehabilitation implementation

This implementation reorganizes Axion around two questions:

- Therapist: **Who needs my attention, what changed, and what happened between visits?**
- Patient: **What do I need to do today, how do I start, and am I doing it correctly?**

## Implemented

- Ranked therapist Needs Attention cards derived from scheduled roadmap adherence, patient-reported pain/discomfort, movement consistency, measured range, symmetry change, repeated difficulty, inactivity, and existing descriptive alerts.
- Real adherence calculations from roadmap target dates and completions, including prescribed-to-date, completed, missed, streak, average session duration, and most-often missed exercise when node-assignment data permits it.
- Patient Today's Recovery card before the roadmap with current-session exercises, dosage, estimated time, phase, adherence, recent consistency, and a single Start Session action that reuses the existing roadmap flow.
- Four-stage clinical recovery context layered over the existing roadmap: Mobility & Baseline, Movement Control, Strength & Capacity, Return to Activity. Existing unlock/completion logic remains authoritative.
- Detailed therapist post-session review from persisted session data with prescription versus completion, valid reps, duration, range, consistency, tempo, symmetry, patient context, prior-session comparison, safety reports, and rep metrics when present.
- Longitudinal 7-day, 30-day, and full-program charts for persisted consistency, range, symmetry, duration, patient-reported pain, and valid-rep percentage when attempted-rep coverage exists.
- Camera setup checklist with person detection, body-region visibility, framing proxy, tracking confidence, explicit camera-angle limitation, and a Begin Exercise gate after calibration.
- Live invalid-rep explanation layer derived only from the existing tracker state and calibration-relative movement-cycle rules. It never increments/decrements the clinical rep count.
- Prescription-builder clarity: active functional controls are distinguished from future clinical target fields that the current data model/tracker does not safely enforce.
- Isolated synthetic clinic demo fixture for a multi-week knee-rehabilitation case. The fixture is in browser source only and is never inserted into production patient tables.

## Intentionally not represented as existing capability

- Pain **before/after** and confidence **before/after** are not separate persisted fields today, so live session review labels them as not collected.
- Older sessions do not persist attempted-rep totals or invalid-rep reasons, so invalid counts and valid-rep percentages remain unavailable instead of being inferred.
- The current movement-profile thresholds are calibration-relative cycle detectors, not therapist-prescribed clinical ROM targets. Target ROM/depth, prescribed tempo, difficulty target, and pain threshold remain explicitly future-ready rather than pretending to drive validation.
- The database contains a `rep_metrics` table, but current stored coverage may be empty; the UI renders rep-by-rep detail only when rows actually exist.

## Clinical boundary

All attention flags and trends are descriptive. They may say that pain increased, movement consistency changed, scheduled sessions were missed, or measured left/right variation increased. They do not diagnose injury, classify risk, or autonomously change treatment.
