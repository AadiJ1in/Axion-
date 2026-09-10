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
- New-session patient context capture: pain before/after and confidence before/after are explicitly patient-reported, stored separately from pose-derived movement data, and shown in therapist session review.
- New-session attempt coverage: observed attempts, rejected attempts, tracker validation reasons, and per-rep metrics are persisted when available. The existing Axion tracker remains the only authority that creates a valid clinical repetition.
- Longitudinal valid-rep percentage becomes available only for sessions with persisted attempted-rep coverage; older sessions remain missing rather than being inferred.
- Therapist-defined **review targets** for measured movement range, tempo, preferred maximum difficulty, and patient-reported pain. Targets are stored per assignment, visible to the patient, and compared against completed sessions for therapist review.
- Review targets are deliberately separate from the calibration-relative rep detector: they do not change sets/reps, invalidate repetitions, unlock roadmap nodes, or modify a plan automatically.
- Prescription-builder clarity distinguishes working dosage controls from review/decision-support fields and from future features that would require stronger clinical validation.
- Isolated synthetic clinic demo fixture for a multi-week knee-rehabilitation case. The fixture is in browser source only and is never inserted into production patient tables.

## Coverage boundaries

- Sessions completed before patient-context capture was introduced may not contain pain-before/after, confidence-before/after, attempted-rep totals, rejected-attempt reasons, or rep-metric rows. Axion leaves those values unavailable rather than backfilling synthetic data.
- The current movement-profile thresholds are calibration-relative cycle detectors, not therapist-prescribed clinical ROM targets. Therapist review targets are comparison context only and do not feed the rep validator.
- Single-camera pose estimation cannot prove clinical correctness, tissue loading, muscle activation, diagnosis, or safety. Camera setup and target comparisons remain descriptive.
- A configured review target is not a treatment recommendation from Axion. It is a value entered by the treating therapist for their own review workflow.

## Clinical boundary

All attention flags, target comparisons, and trends are descriptive. They may say that pain increased, a therapist-entered review target was crossed, movement consistency changed, scheduled sessions were missed, or measured left/right variation increased. They do not diagnose injury, classify medical risk, or autonomously change treatment.
