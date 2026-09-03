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
- Session submissions include a patient-scoped idempotency identifier to prevent accidental duplicate rows.
- Invitation creation, claim, therapist approval, and plan publication are transactional database RPCs.
- Sensitive workflow mutations produce server-side audit events in a non-exposed schema.
- Browser sessions use `sessionStorage` rather than persistent cross-restart token storage.
- Authentication uses the PKCE flow, and password resets revoke every other active session.
- Authenticated sessions automatically sign out after 15 minutes without user activity.
- Role-gated database access requires the JWT's Supabase session to remain active, so server-side revocation takes effect before token expiry.
- Patient-facing operational errors are mapped to safe messages instead of exposing database or policy details.
- Authenticated entry pages use `Cache-Control: private, no-store` and reject back-forward cached private workspaces.
- The deployed Content Security Policy blocks framing, plugins, inline scripts, and unapproved network destinations.
- Runtime JavaScript and WebAssembly are bundled from exact lockfile versions; the external pose-model binary must match its pinned SHA-256 digest before use.
- Row Level Security restricts patient access to their own profile and sessions.
- Current browser grants are least-privilege, and database default privileges keep future tables, sequences, and functions inaccessible until explicitly granted.
- Free-text patient/therapist messaging is removed from the application, revoked from browser roles, protected by an explicit deny-all RLS policy, and excluded from Realtime publication.
- The synthetic demo is explicitly labeled and does not require an account.

## Required before real healthcare use

Independent review must cover HIPAA applicability, BAAs, privacy notices and consent, retention and deletion, security risk analysis, threat modeling, penetration testing, auditability, incident response, backup and disaster recovery, accessibility, clinical validation, human factors, model bias and failure modes, regulatory classification, monitoring, and change control.

No person should interpret Axion's current movement metrics, heatmap, coaching text, or Recovery Pulse as diagnosis, risk classification, prognosis, or autonomous treatment guidance.

## Required operator settings before collecting real patient information

- Enable leaked-password protection in Supabase Auth (Pro plan or higher).
- Require email confirmation and configure a trusted custom SMTP sender on the Axion domain.
- Enable CAPTCHA/bot protection and review Auth rate limits before public signup is announced.
- Require MFA for therapist accounts and MFA for every Supabase/GitHub/Vercel administrator.
- Configure production redirect URLs so verification links never return to localhost.
- Enable database SSL enforcement, network restrictions, backups/PITR appropriate to the risk assessment, and alerting.
- Rotate any service-role or secret key that has ever appeared in a screenshot, message, terminal output, or repository history.

The browser app receives only the public publishable key for Axion project `qjcxelpzcfmcsrpsnlrs`. No service-role or `sb_secret_` key belongs in this repository.
