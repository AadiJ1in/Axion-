# Axion RC1 migration and schema checklist

The machine-readable source of truth for RC1 schema capability requirements is [`supabase/rc1-schema-manifest.json`](../supabase/rc1-schema-manifest.json). Do not maintain a second hand-written migration inventory in this document.

The RC1 browser expects application schema version `202609100004`. The database exposes only that non-sensitive compatibility value through `public.axion_application_schema_version()`; the browser does not inspect migration SQL or privileged migration metadata.

## Production state verified during RC1 audit

The connected production Supabase project was queried through its migration API during the RC1 audit. Existing production capabilities required by the current application were confirmed for session capture context, clinical review targets, rest intervals, movement-game assignment metadata, roadmap state, therapist MFA, review receipts/queue, and the existing security-policy migrations. The manifest records the observed production migration name/version for each required capability.

Production also contains four September 8 historical workspace-performance migrations that are not current client dependencies. They remain recorded under `historicalProductionOnly` so database history is not confused with the repository's current required-capability list.

The repository currently has two historical filename-prefix collisions (`202609100001` and `202609100002`). Those predate RC1 and are explicitly enumerated in the manifest. RC1 does not use the filename prefix alone as the application compatibility contract.

## RC1 deployment order

Before publishing an RC1 frontend that expects `202609100004`:

1. Apply `202609100003_rc1_verified_session_identity.sql`.
2. Verify its columns, trigger, indexes, existing RLS, and idempotency constraints.
3. Apply `202609100004_rc1_application_schema_version.sql`.
4. Verify `select public.axion_application_schema_version()` returns `202609100004`.
5. Run Supabase Security Advisor and confirm no new RLS/security warning was introduced.
6. Run the complete RC1 release gate against the exact application revision.
7. Deploy that same revision.
8. Smoke-test patient login, exact assignment start, one controlled synthetic/nonclinical session, duplicate retry, and therapist review.

Do not deploy the RC1 frontend before the schema-version RPC exists: authenticated workspaces intentionally fail closed on a missing or incompatible schema version.

## Change classification

Both new RC1 migrations are additive to stored data. `202609100003` adds identity/provenance columns and a validation trigger; existing historical `exercise_sessions` remain `session_context_version = 0`. The migration does not rewrite old session identity as if it had been captured prospectively. `202609100004` adds a read-only compatibility RPC.

The identity trigger is behaviorally stricter even though the schema change is additive. New clinical session inserts must contain an exact active assignment, client session UUID, matching exercise key, a valid patient-owned active plan, and the correct roadmap-node mapping when the plan uses roadmap nodes. This is intentional fail-closed behavior.

## Old-client compatibility

Older clients that omit the new `plan_id` column are still server-resolved to the assignment's plan. However, an older client that attempts a roadmap-backed clinical session without a valid roadmap node or with stale/mismatched assignment context will be rejected by the RC1 trigger. Therefore RC1 is a coordinated application/database release, not a promise that every historical browser bundle remains write-compatible indefinitely.

## Rollback considerations

Application rollback is safe only to a client that still sends identity fields accepted by the stricter trigger. Do not drop the RC1 identity columns or trigger merely to make an older broken client write again.

If RC1 application deployment must be rolled back, first assess whether the target application revision uses exact assignment and roadmap identity. Prefer deploying a corrected client over weakening data-integrity validation. The new columns are additive and should normally remain in place. A database rollback that drops them would remove provenance from new sessions and requires an explicit migration/change-control decision.

## Verification commands

Local repository consistency:

```bash
node scripts/verify-rc1-schema-manifest.mjs
node scripts/schema-compatibility-test.mjs
node scripts/session-identity-test.mjs
```

Production verification must be performed against the target Supabase project immediately before release; a passing repository check does not prove that production migrations were applied.
