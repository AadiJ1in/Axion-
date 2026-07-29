# Security and HIPAA Readiness Checklist

This checklist is planning material, not certification.

## Implemented in this proof of concept

- Fresh environment variables rather than embedded project credentials
- Supabase Auth for email/password authentication
- Server-controlled role assignment
- RLS enabled on application tables
- Least-privilege table grants
- No anonymous table access
- Browser-side camera processing
- No raw video persistence
- Input constraints on session data
- Explicit synthetic/nonclinical labeling

## Required before real-world use

- Independent HIPAA applicability analysis and legal review
- Signed BAAs with every relevant vendor
- Complete data inventory and data-flow diagram
- Formal risk analysis and risk-management plan
- Secure software development lifecycle
- Dependency and secret scanning in CI
- Content Security Policy and hardened HTTP headers
- MFA or phishing-resistant authentication for workforce users
- Administrative user lifecycle and access reviews
- Append-only security audit logging
- Rate limiting, abuse detection, and alerting
- Incident response and breach-notification procedures
- Retention, deletion, backup, and disaster-recovery testing
- Penetration test and remediation
- Clinical safety case and model validation
- Accessibility and human-factors validation
