# Recovery journey and Ruins Runner

This release changes only the patient roadmap presentation and the existing squat game's presentation/control path. Assignment filtering, therapist dosage, database schema, RLS and completion triggers remain authoritative and unchanged.

## Roadmap

The supplied brief was implemented sequentially: one visual sketch, roadmap implementation and browser inspection, then the squat game. The map uses the actual treatment stages and their existing session thresholds. Current/completed/locked state continues to use saved roadmap completions, assigned exercise IDs, full prescribed dose, and therapist overrides. Whole journey and My location controls provide overview and phase focus. Node clicks use the existing prescription modal and lab launch.

## Squat game

A lightweight Canvas landscape, articulated explorer, stone passages and foreground motion replace the main webcam game. Existing squat analysis emits continuous movement samples. A 45 ms smoothing time constant removes small visual jitter; the first validated prescribed rep supplies a comfortable movement range. Bounds clamp at that range. The game does not modify the clinical detector's thresholds. The first rep is an obstacle-free tutorial. Later passages advance independently with a generous lead and timing no faster than the comfortable observed rep tempo.

The existing clinical detector alone emits counted reps. Collisions change score only. Incomplete movement can move the explorer but cannot fabricate a clinical rep. Tracking loss freezes gameplay; pause/rest reset the next passage's approach so returning patients have time to prepare. The game ends at the prescribed total. The existing therapist rest deadline and safety/background pause guards remain in use.

A compact tracked-body panel shows the patient's pose alongside an animated Buddy demonstration. Camera/video overlays remain available at desktop widths; mobile prioritizes the tracked body and Buddy. No video uploads, new currencies, or collectibles were introduced.

## Verification boundary

The development-only `/?journey-playtest` fixture uses synthetic identities and 2 sets of 2 reps with a 15-second rest. Its simulator exercises the real rep-cycle detector; it cannot call the real patient save path. Fixture completion updates only in-memory roadmap state. The fixture, QA page and simulator are excluded from the production entry build.

Automated coverage includes continuous calibrated movement, clamped range, stale tracking, collisions, clinical count isolation, invalid reps, pause, target cap, roadmap stage boundaries and full-dose checks, existing prescription filters and actual tracker lifecycle failures/recovery. Browser checks use the actual patient/lab UI with synthetic data. Physical camera tracking and clinician-approved exercise suitability still require real-device validation; cloud simulation is not evidence of clinical safety or clinical accuracy.
