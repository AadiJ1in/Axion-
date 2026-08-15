# Axion Movement Intelligence POC

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
- bodyweight squat state tracking and rep-level depth, tempo, and symmetry-delta summaries;
- sequence-aware coaching messages;
- one-click 70-second synthetic pitch mode that does not depend on camera conditions;
- visible body-detection, confidence-quality, and real-camera recovery states;
- post-session difficulty and discomfort reflection;
- best-rep and performance-shift identification;
- coordinate-based skeleton replay;
- Movement Signature and descriptive joint-consistency map;
- therapist dashboard, Recovery Pulse, and therapist-review suggestion;
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

## Optional Supabase setup

1. Create a new Supabase project.
2. Run `supabase/schema.sql`.
3. Add the new URL and publishable/anon key to `src/config.js`.
4. Create accounts through Supabase Auth.
5. Promote therapist accounts only through the administrative SQL shown at the end of the schema.

## Scope and boundaries

This repository is a UI prototype, technical proof of concept, nonclinical MVP using synthetic data, and HIPAA-readiness starting point subject to independent legal, privacy, security, operational, regulatory, accessibility, human-factors, and clinical review.

It does not claim HIPAA compliance, medical-device status, clinical accuracy, diagnostic capability, treatment efficacy, or security certification. Thresholds and derived movement metrics are heuristic and unvalidated. The Recovery Pulse is an engagement/performance summary, not a prognosis. Do not use real patient information with this proof of concept.
