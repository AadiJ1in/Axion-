# Axion Nonclinical MVP

A runnable UI prototype and technical proof of concept for a gamified rehabilitation platform.

## Scope

This project intentionally represents itself as:

- a UI prototype;
- a technical proof of concept;
- a nonclinical MVP using synthetic data;
- a HIPAA-readiness starting point subject to independent legal, privacy, security, operational, and clinical review.

It does **not** claim HIPAA compliance, medical-device status, clinical accuracy, diagnostic capability, treatment efficacy, or immunity from security vulnerabilities.

## Included

- Supabase email/password authentication
- Public signup restricted to the `patient` role
- Therapist role assigned only by an administrator
- Postgres Row Level Security policies
- Synthetic therapist dashboard
- Browser-side MediaPipe Pose Landmarker
- One exercise: bodyweight squat repetition counting
- Minimal session result storage: exercise key, repetition count, source, timestamp
- No raw camera upload or storage

## Local setup

1. Create a **new** Supabase project.
2. Open the Supabase SQL Editor and run `supabase/schema.sql`.
3. Open `src/config.js` and add the new project URL and publishable/anon key.
4. Serve the folder locally:

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`. Camera access generally requires `localhost` or HTTPS.

## Create a therapist account

1. Create the account through Supabase Auth or the app.
2. In the SQL Editor, run the promotion query at the bottom of `supabase/schema.sql`.
3. Sign out and sign in again.

The browser cannot choose or modify the therapist role.

## Computer vision logic

The MediaPipe model estimates pose landmarks locally. The counter:

- calculates left and/or right knee angles;
- enters the `down` state after multiple frames below 105°;
- counts one repetition after returning above 155° for multiple frames;
- requires landmark visibility above 0.55.

These thresholds are heuristic and are not clinically validated. Accuracy varies with camera angle, lighting, clothing, mobility, anatomy, occlusion, assistive devices, and movement style.

## Before any real healthcare deployment

At minimum, obtain independent review covering:

- HIPAA applicability and organizational compliance;
- Business Associate Agreements and cloud configuration;
- formal security risk analysis;
- threat modeling and penetration testing;
- privacy notices, consent, retention, deletion, and incident response;
- accessibility;
- clinical validation and human-factors testing;
- medical-device regulatory analysis;
- model bias, failure modes, monitoring, and change control;
- backup, disaster recovery, audit logging, and operational ownership.

Do not upload real patient information to this proof of concept.
