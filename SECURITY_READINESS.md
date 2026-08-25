# Security and privacy readiness

Axion is currently a nonclinical proof of concept for synthetic data.

## Current technical boundaries

- Camera frames are processed in the browser.
- The movement model uses 3D world landmarks locally; only the derived summary is eligible for upload.
- The prototype does not upload or store raw camera video.
- The database stores a minimal session summary only after an authenticated patient submits it.
- Public signup creates only a patient role.
- Therapist role assignment is server-controlled.
- Patient-to-therapist relationships require a cryptographically random, email-bound, one-time invitation that expires after 48 hours.
- Invitation plaintext is returned once and never stored; only SHA-256 hashes are retained.
- Privileged authorization functions live in a non-exposed private schema with a fixed empty search path.
- Session submissions include a client idempotency identifier to prevent accidental duplicate rows.
- Connection creation and claiming produce server-side audit events.
- Row Level Security restricts patient access to their own profile and sessions.
- The synthetic demo is explicitly labeled and does not require an account.

## Required before real healthcare use

Independent review must cover HIPAA applicability, BAAs, privacy notices and consent, retention and deletion, security risk analysis, threat modeling, penetration testing, auditability, incident response, backup and disaster recovery, accessibility, clinical validation, human factors, model bias and failure modes, regulatory classification, monitoring, and change control.

No person should interpret Axion's current movement metrics, heatmap, coaching text, or Recovery Pulse as diagnosis, risk classification, prognosis, or autonomous treatment guidance.

## Immediate operator action

Rotate any service-role or secret key that has ever appeared in a screenshot, message, terminal output, or repository history. The browser app must receive only the public publishable/anon key for the exact PTpal project.
