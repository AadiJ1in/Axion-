import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EXPECTED_SCHEMA_VERSION } from "../src/release/release-config.js";

const manifest = JSON.parse(fs.readFileSync("supabase/rc1-schema-manifest.json", "utf8"));
assert.equal(manifest.manifestVersion, 1, "unexpected schema manifest format");
assert.equal(manifest.applicationSchemaVersion, EXPECTED_SCHEMA_VERSION, "frontend/schema manifest version mismatch");

const migrationDir = "supabase/migrations";
const files = fs.readdirSync(migrationDir).filter((name) => name.endsWith(".sql"));
const fileSet = new Set(files);
const ids = new Set();
for (const capability of manifest.requiredCapabilities || []) {
  assert.ok(capability.id && !ids.has(capability.id), `duplicate capability id ${capability.id}`);
  ids.add(capability.id);
  assert.ok(fileSet.has(capability.repositoryFile), `missing required migration file ${capability.repositoryFile}`);
  assert.equal(capability.destructive, false, `RC1 manifest must not silently include destructive migration ${capability.id}`);
}

const prefixes = new Map();
for (const file of files) {
  const match = file.match(/^(\d{12})_/);
  if (!match) continue;
  const list = prefixes.get(match[1]) || [];
  list.push(file);
  prefixes.set(match[1], list);
}
for (const [prefix, list] of prefixes) {
  if (list.length <= 1) continue;
  const accepted = [...(manifest.acceptedDuplicateRepositoryPrefixes?.[prefix] || [])].sort();
  assert.deepEqual([...list].sort(), accepted, `unregistered duplicate migration prefix ${prefix}`);
}

const pending = manifest.requiredCapabilities.filter((item) => item.productionVersion === null);
assert.deepEqual(pending.map((item) => item.id), ["rc1_verified_session_identity", "rc1_application_schema_version"],
  "unexpected pending RC1 production migration set");
assert.deepEqual(pending.map((item) => item.deploymentOrder), [1, 2], "RC1 migrations must have deterministic order");

const schemaVersionSql = fs.readFileSync(path.join(migrationDir, "202609100004_rc1_application_schema_version.sql"), "utf8");
assert.ok(schemaVersionSql.includes(`select '${EXPECTED_SCHEMA_VERSION}'::text`), "schema RPC does not expose expected version");

console.log(`RC1 schema manifest: ok (${manifest.requiredCapabilities.length} required capabilities, ${pending.length} pending production migrations)`);
