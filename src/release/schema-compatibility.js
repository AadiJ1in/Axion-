import { EXPECTED_SCHEMA_VERSION, SCHEMA_COMPATIBILITY_VERSION } from "./release-config.js";

export const SCHEMA_UNAVAILABLE_MESSAGE =
  "Axion is temporarily unavailable while the application is being updated. No treatment data has been changed.";

export class SchemaCompatibilityError extends Error {
  constructor(actualVersion = null, code = "SCHEMA_VERSION_MISMATCH") {
    super(SCHEMA_UNAVAILABLE_MESSAGE);
    this.name = "SchemaCompatibilityError";
    this.code = code;
    this.expectedVersion = EXPECTED_SCHEMA_VERSION;
    this.actualVersion = actualVersion;
    this.userMessage = SCHEMA_UNAVAILABLE_MESSAGE;
  }
}

export function evaluateSchemaCompatibility(actualVersion) {
  const actual = String(actualVersion ?? "").trim();
  return Object.freeze({
    contractVersion: SCHEMA_COMPATIBILITY_VERSION,
    expected: EXPECTED_SCHEMA_VERSION,
    actual: actual || null,
    compatible: actual === EXPECTED_SCHEMA_VERSION,
  });
}

export function assertSchemaCompatible(actualVersion) {
  const result = evaluateSchemaCompatibility(actualVersion);
  if (!result.compatible) throw new SchemaCompatibilityError(result.actual);
  return result;
}

let cached = null;
let checkedAt = 0;

export async function verifyRuntimeSchema(client, { force = false, maxAgeMs = 30000 } = {}) {
  if (!client?.rpc) throw new SchemaCompatibilityError(null, "SCHEMA_CHECK_UNAVAILABLE");
  if (!force && cached?.compatible && Date.now() - checkedAt < maxAgeMs) return cached;
  const { data, error } = await client.rpc("axion_application_schema_version");
  if (error) throw new SchemaCompatibilityError(null, "SCHEMA_CHECK_FAILED");
  cached = assertSchemaCompatible(data);
  checkedAt = Date.now();
  return cached;
}

export function resetSchemaCompatibilityCache() {
  cached = null;
  checkedAt = 0;
}
