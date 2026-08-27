# Axion Movement Intelligence

Axion turns a prescribed movement into an understandable session for the patient and a concise movement report for the therapist.

## Product demo

The public synthetic demo works without configuration:

1. Open **Motion Lab**.
2. Choose **Demo Mode · 70 sec**.
3. Watch the scripted flow advance through calibration, five reps, live coaching, session completion, Motion Signature, Baseline vs Today, and the updated therapist dashboard.
4. Use **Next step** to advance faster or **Reset demo** to restore the original seeded state.
5. See [`DEMO.md`](DEMO.md) for the exact presenter script, expected outputs, QA routes, and fallback behavior.

## What is implemented

- three-second session calibration using locally estimated pose landmarks;
- live Movement Twin reconstructed from MediaPipe coordinates;
- 61 explicit exercise-tracking profiles: 42 calibrated rep-cycle counters and 19 camera-timed position holds;
- movement-specific signals for the neck, shoulders, arms, trunk, hips, knees, ankles, feet, balance, and gait;
- rep-level excursion, tempo, and bilateral-difference summaries using each exercise's relevant landmarks;
- sequence-aware coaching messages;
- one-click 70-second synthetic pitch mode that does not depend on camera conditions;
- visible body-detection, confidence-quality, and real-camera recovery states;
- post-session difficulty and discomfort reflection;
- best-rep and performance-shift identification;
- coordinate-based skeleton replay;
- Movement Signature and descriptive joint-consistency map;
- therapist dashboard, Recovery Pulse, and therapist-review suggestion;
- role-aware patient recovery portal with XP, streaks, milestones, daily prescriptions, momentum, and achievements;
- three-biome Treatment Roadmap with milestone-level progress, clinician-controlled unlocks, and patient-scoped live updates;
- functional therapist workspace sections for patients, recovery roadmaps, check-ins, attention alerts, and the exercise library;
- 61-movement therapist library organized into 14 anatomical sections from neck and shoulders through core, hips, quads, calves, feet, and balance;
- patient-ready setup, numbered technique steps, form cues, common mistakes, safety guidance, and optional AAOS/NHS visual-guide links for every exercise;
- the same exercise guidance shown in the patient roadmap and inside Motion Lab before tracking starts;
- live therapist statistics, patient filtering, actionable check-ins, and descriptive review alerts derived from authorized session data;
- working session-summary export, replay/trajectory switching, and private therapist notes;
- a signed-in account workspace for display-name updates, password recovery, and secure sign-out;
- patient account creation with patient-only public role assignment;
- cryptographically random, email-bound, single-use therapist invitations that expire after 48 hours;
- real patient XP, streak, completion, and therapist panel summaries derived from protected session rows;
- Recovery Arcade entry points that launch prescribed movement inside Motion Lab;
- therapist Connections and Security workspaces modeled after the YC demonstration;
- therapist-to-patient exercise assignment with a persistent synthetic demo path and Supabase-backed live path;
- Baseline vs Today comparison and four-week therapist drill-down;
- explainable “Why Axion flagged this” attention-queue rationale;
- loading, empty, and error states with recovery actions;
- keyboard rep navigation, mobile haptics, milestone feedback, reduced-motion support, and reset-demo control;
- optional Supabase authentication, database roles, RLS, and minimal session-summary storage;
- no raw camera upload or storage.

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

Run the zero-dependency validation:

```bash
npm run check
```

## Supabase production setup

The deployed app uses Axion project `qjcxelpzcfmcsrpsnlrs` and the browser-safe publishable key in `src/config.js`.

The applied production migration sequence is:

1. `202608250001_patient_personalization.sql`
2. `202608250002_security_hardening.sql`
3. `202608250003_data_api_grants.sql`
4. `202608250004_production_security.sql`
5. `202608250005_security_advisor_cleanup.sql`
6. `202608250006_claim_invitation_constraint.sql`
7. `202608250007_profile_onboarding_grants.sql`
8. `202608250008_individual_exercise_prescriptions.sql`
9. `202608270001_enable_roadmap_realtime.sql`
10. `202608270002_expand_exercise_catalog.sql`
11. `202608270003_exercise_specific_pose_tracking.sql`

The migrations hash invitation codes at rest, move multi-table mutations behind transactional RPCs, validate session-to-assignment ownership, add workflow audit events, make session writes idempotent, and keep the server-authoritative exercise allowlist in the unexposed `private` schema. Promote therapist accounts only through a trusted administrative workflow; public signup always creates a patient.

The browser receives only the publishable/anon key. Never place a Supabase service-role key in `src/config.js`; row-level security is the authorization boundary.

`supabase/tests/rls_integration.sql` exercises the complete approval and session workflow with synthetic identities inside a transaction that is always rolled back. It verifies pending approval, therapist verification, patient-specific plans, assignment-bound session writes, duplicate-write rejection, and cross-patient isolation.

See [`SECURITY_READINESS.md`](SECURITY_READINESS.md) for the operator controls still required before real healthcare use.

## Scope and boundaries

This repository is a UI prototype, technical proof of concept, nonclinical MVP using synthetic data, and HIPAA-readiness starting point subject to independent legal, privacy, security, operational, regulatory, accessibility, human-factors, and clinical review. Each tracker uses a three-second patient-specific baseline, hysteresis, visibility checks, and minimum/maximum rep timing. It detects repeatable landmark motion—not pain, muscle activation, resistance, load, or clinical safety. Small isolated movements such as toe curls may be below normal webcam-pose resolution and require therapist observation.

It does not claim HIPAA compliance, medical-device status, clinical accuracy, diagnostic capability, treatment efficacy, or security certification. Thresholds and derived movement metrics are heuristic and unvalidated. The Recovery Pulse is an engagement/performance summary, not a prognosis. Do not use real patient information with this proof of concept.
