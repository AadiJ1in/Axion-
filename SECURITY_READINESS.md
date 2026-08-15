# Security and privacy readiness

Axion is currently a nonclinical proof of concept for synthetic data.

## Current technical boundaries

- Camera frames are processed in the browser.
- The prototype does not upload or store raw camera video.
- The database stores a minimal session summary only after an authenticated patient submits it.
- Public signup creates only a patient role.
- Therapist role assignment is server-controlled.
- Row Level Security restricts patient access to their own profile and sessions.
- The synthetic demo is explicitly labeled and does not require an account.

## Required before real healthcare use

Independent review must cover HIPAA applicability, BAAs, privacy notices and consent, retention and deletion, security risk analysis, threat modeling, penetration testing, auditability, incident response, backup and disaster recovery, accessibility, clinical validation, human factors, model bias and failure modes, regulatory classification, monitoring, and change control.

No person should interpret Axion's current movement metrics, heatmap, coaching text, or Recovery Pulse as diagnosis, risk classification, prognosis, or autonomous treatment guidance.
