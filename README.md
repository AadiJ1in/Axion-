# Axion Movement Intelligence POC

Axion turns a prescribed movement into an understandable session for the patient and a concise movement report for the therapist.

## Product demo

The public synthetic demo works without configuration:

1. Open **Motion Lab**.
2. Choose **Run pitch demo**.
3. Watch calibration, the Movement Twin, contextual coaching, energy progression, and rep metrics.
4. Finish the session, answer two reflection questions, and open the Movement Report.
5. Use **Therapist** to show the attention queue and Recovery Pulse workflow.

## What is implemented

- three-second session calibration using locally estimated pose landmarks;
- live Movement Twin reconstructed from MediaPipe coordinates;
- bodyweight squat state tracking and rep-level depth, tempo, and symmetry-delta summaries;
- sequence-aware coaching messages;
- one-click synthetic pitch mode that does not depend on camera conditions;
- post-session difficulty and discomfort reflection;
- best-rep and performance-shift identification;
- coordinate-based skeleton replay;
- Movement Signature and descriptive joint-consistency map;
- therapist dashboard, Recovery Pulse, and therapist-review suggestion;
- optional Supabase authentication, database roles, RLS, and minimal session-summary storage;
- no raw camera upload or storage.

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Optional Supabase setup

1. Create a new Supabase project.
2. Run `supabase/schema.sql`.
3. Add the new URL and publishable/anon key to `src/config.js`.
4. Create accounts through Supabase Auth.
5. Promote therapist accounts only through the administrative SQL shown at the end of the schema.

## Scope and boundaries

This repository is a UI prototype, technical proof of concept, nonclinical MVP using synthetic data, and HIPAA-readiness starting point subject to independent legal, privacy, security, operational, regulatory, accessibility, human-factors, and clinical review.

It does not claim HIPAA compliance, medical-device status, clinical accuracy, diagnostic capability, treatment efficacy, or security certification. Thresholds and derived movement metrics are heuristic and unvalidated. The Recovery Pulse is an engagement/performance summary, not a prognosis. Do not use real patient information with this proof of concept.
