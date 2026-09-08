# Security and privacy readiness

Axion is currently a nonclinical proof of concept for synthetic data.

## Encryption posture

- All browser-to-Supabase API traffic uses HTTPS; Supabase Auth, PostgREST, Storage, and Realtime HTTP endpoints enforce SSL on incoming connections.
- Vercel and Netlify both send a two-year HSTS policy and a CSP with `upgrade-insecure-requests`; plaintext `http://` and `ws://` runtime endpoints are rejected by CI.
- Supabase states that hosted project data is encrypted at rest and in transit. Axion does not create any public Storage buckets.
- Camera frames remain local to the browser and are not uploaded or stored. Only derived movement summaries are eligible for authenticated upload.
- The browser contains only the public `sb_publishable_` Supabase key. Service-role keys, secret keys, private keys, environment files, and database DSNs are prohibited from runtime source and protected by `.gitignore` plus CI checks.
- Authentication uses PKCE. Session tokens are kept in `sessionStorage`, not persistent `localStorage`, and authenticated sessions automatically sign out after inactivity.
- Axion intentionally does not claim end-to-end encryption. In a static browser application, encrypting a session token with another key available to the same JavaScript origin does not meaningfully protect against XSS. A future requirement for HttpOnly-cookie or true end-to-end key isolation would require a server-side/BFF or envelope-encryption architecture, respectively.
- Direct Postgres administrative connections are outside the browser application boundary. Database SSL enforcement should be enabled in the Supabase project settings before real patient information is collected.

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
- Therapist clinical access requires an authenticator-app MFA challenge and an `aal2` Supabase session; password-only therapist sessions cannot pass database authorization.
- Authenticated sessions automatically sign out after 15 minutes without user activity.
- Role-gated database access requires the JWT's Supabase session to remain active, so server-side revocation takes effect before token expiry.
- Patient-facing operational errors are mapped to safe messages instead of exposing database or policy details.
- Authenticated entry pages use `Cache-Control: private, no-store` and reject back-forward cached private workspaces.
- The deployed Content Security Policy blocks framing, plugins, inline scripts, and unapproved network destinations.
- Runtime JavaScript and WebAssembly are bundled from exact lockfile versions; the external pose-model binary must match its pinned SHA-256 digest before use.
- Patient exercise cards do not navigate to third-party education sites; a deploying clinic must review and configure any approved patient-facing materials.
- Row Level Security is enabled on every public application table and restricts data to authorized patient/therapist relationships.
- Current browser grants are least-privilege, and database default privileges keep future tables, sequences, and functions inaccessible until explicitly granted.
- GitHub runs locked dependency checks, application regressions, production builds, extended CodeQL analysis, and encryption-boundary regression checks on pull requests, `main`, and a weekly schedule.
- Free-text patient/therapist messaging is removed from the application, revoked from browser roles, protected by an explicit deny-all RLS policy, and excluded from Realtime publication.
- The synthetic demo is explicitly labeled and does not require an account.

## Required before real healthcare use

Independent review must cover HIPAA applicability, BAAs, privacy notices and consent, retention and deletion, security risk analysis, threat modeling, penetration testing, auditability, incident response, backup and disaster recovery, accessibility, clinical validation, human factors, model bias and failure modes, regulatory classification, monitoring, and change control.

No person should interpret Axion's current movement metrics, heatmap, coaching text, or Recovery Pulse as diagnosis, risk classification, prognosis, or autonomous treatment guidance.

## Required operator settings before collecting real patient information

- Enable leaked-password protection in Supabase Auth (currently reported disabled by Supabase Security Advisor).
- Require email confirmation and configure a trusted custom SMTP sender on the Axion domain.
- Enable CAPTCHA/bot protection and review Auth rate limits before public signup is announced.
- Require MFA for therapist accounts and MFA for every Supabase/GitHub/Vercel administrator.
- Configure production redirect URLs so verification links never return to localhost.
- Enable database SSL enforcement, network restrictions, backups/PITR appropriate to the risk assessment, and alerting.
- Rotate any service-role or secret key that has ever appeared in a screenshot, message, terminal output, or repository history.

The browser app receives only the public publishable key for Axion project `qjcxelpzcfmcsrpsnlrs`. No service-role or `sb_secret_` key belongs in this repository.
