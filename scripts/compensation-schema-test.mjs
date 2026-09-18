import assert from "node:assert/strict";
import fs from "node:fs";

const tableSql = fs.readFileSync("supabase/migrations/20260917165752_add_compensation_migration_snapshots.sql", "utf8");
const indexSql = fs.readFileSync("supabase/migrations/20260917171123_index_compensation_assignment.sql", "utf8");

const required = [
  "public.movement_biomechanics_sessions",
  "exercise_sessions(id) on delete cascade",
  "profiles(id) on delete cascade",
  "exercise_assignments(id)",
  "features jsonb",
  "compensation_analysis jsonb",
  "enable row level security",
  "movement_biomechanics_insert_patient",
  "movement_biomechanics_read_authorized",
  "private.current_app_role()",
  "therapist_patients",
  "tp.status = 'active'::text",
  "es.assignment_id = movement_biomechanics_sessions.assignment_id",
  "es.exercise_key = movement_biomechanics_sessions.exercise_key",
  "no raw video or images",
  "not a diagnosis or injury prediction",
];

for (const marker of required) {
  assert.ok(tableSql.includes(marker), `biomechanics schema contract missing: ${marker}`);
}

assert.ok(tableSql.includes("24576"), "features payload size cap missing");
assert.ok(tableSql.includes("16384"), "analysis payload size cap missing");
assert.ok(tableSql.includes("from anon"), "anonymous role must be explicitly removed from table access");
assert.ok(tableSql.includes("select, insert"), "signed-in patient capture needs read/insert table access only");
assert.ok(!tableSql.toLowerCase().includes("grant update"), "client update access must not be introduced");
assert.ok(!tableSql.toLowerCase().includes("grant delete"), "client delete access must not be introduced");
assert.ok(indexSql.includes("movement_biomechanics_assignment_idx"));
assert.ok(indexSql.includes("assignment_id"));

console.log("compensation biomechanics schema contract passed");
