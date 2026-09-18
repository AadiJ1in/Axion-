import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyClinicalTrialText } from "../src/clinical-evidence-registry.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEED_PATH = resolve(ROOT, "research/clinicaltrials/seed-studies.json");
const DEFAULT_OUTPUT = resolve(ROOT, "research/clinicaltrials/registry.generated.json");
const API_BASE = "https://clinicaltrials.gov/api/v2";
const SEARCH_TERMS = Object.freeze([
  "pose estimation rehabilitation",
  "computer vision rehabilitation",
  "markerless motion capture rehabilitation",
  "AI physical therapy",
  "telerehabilitation artificial intelligence",
  "gait pose estimation rehabilitation",
  "movement compensation rehabilitation",
]);

function args() {
  const input = process.argv.slice(2);
  const value = (name, fallback = null) => {
    const index = input.indexOf(name);
    return index >= 0 && input[index + 1] ? input[index + 1] : fallback;
  };
  return {
    output: resolve(ROOT, value("--output", "research/clinicaltrials/registry.generated.json")),
    discover: input.includes("--discover"),
    maxDiscovered: Math.max(0, Number(value("--max-discovered", 30)) || 30),
    timeoutMs: Math.max(1000, Number(value("--timeout-ms", 15000)) || 15000),
  };
}

async function requestJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Axion-research-evidence-sync/1.0" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ClinicalTrials.gov request failed (${response.status}) for ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const compact = (value) => String(value || "").replace(/\s+/g, " ").trim();

function outcomeText(outcome) {
  return [outcome?.measure, outcome?.description, outcome?.timeFrame].filter(Boolean).join(" | ");
}

export function studySearchText(study) {
  const protocol = study?.protocolSection || {};
  const identification = protocol.identificationModule || {};
  const description = protocol.descriptionModule || {};
  const conditions = protocol.conditionsModule || {};
  const interventions = protocol.armsInterventionsModule?.interventions || [];
  const outcomes = protocol.outcomesModule || {};
  return compact([
    identification.briefTitle,
    identification.officialTitle,
    description.briefSummary,
    description.detailedDescription,
    ...(conditions.conditions || []),
    ...(conditions.keywords || []),
    ...interventions.flatMap((item) => [item.name, item.description]),
    ...(outcomes.primaryOutcomes || []).map(outcomeText),
    ...(outcomes.secondaryOutcomes || []).map(outcomeText),
    ...(outcomes.otherOutcomes || []).map(outcomeText),
  ].filter(Boolean).join(" \n"));
}

function normalizeOutcomes(module = {}) {
  const rows = [];
  for (const [type, values] of [
    ["primary", module.primaryOutcomes || []],
    ["secondary", module.secondaryOutcomes || []],
    ["other", module.otherOutcomes || []],
  ]) {
    for (const outcome of values) {
      rows.push({
        type,
        measure: compact(outcome.measure),
        description: compact(outcome.description),
        timeFrame: compact(outcome.timeFrame),
      });
    }
  }
  return rows;
}

function normalizeStudy(study, curated = null) {
  const protocol = study?.protocolSection || {};
  const identification = protocol.identificationModule || {};
  const status = protocol.statusModule || {};
  const sponsor = protocol.sponsorCollaboratorsModule || {};
  const description = protocol.descriptionModule || {};
  const conditions = protocol.conditionsModule || {};
  const interventions = protocol.armsInterventionsModule?.interventions || [];
  const outcomes = normalizeOutcomes(protocol.outcomesModule || {});
  const ipd = protocol.ipdSharingStatementModule || {};
  const references = protocol.referencesModule || {};
  const text = studySearchText(study);
  const nctId = identification.nctId || curated?.nctId || null;
  return {
    nctId,
    studyUrl: nctId ? `https://clinicaltrials.gov/study/${nctId}` : null,
    apiUrl: nctId ? `${API_BASE}/studies/${nctId}` : null,
    title: identification.briefTitle || identification.officialTitle || curated?.title || null,
    officialTitle: identification.officialTitle || null,
    overallStatus: status.overallStatus || status.lastKnownStatus || null,
    lastUpdatePosted: status.lastUpdatePostDateStruct?.date || null,
    sponsor: sponsor.leadSponsor?.name || identification.organization?.fullName || null,
    conditions: conditions.conditions || [],
    keywords: conditions.keywords || [],
    briefSummary: compact(description.briefSummary),
    interventions: interventions.map((item) => ({
      type: item.type || null,
      name: compact(item.name),
      description: compact(item.description),
    })),
    outcomes,
    detectedMovementSignals: classifyClinicalTrialText(text),
    ipdSharing: {
      plan: ipd.ipdSharing || curated?.dataSharing?.ipdPlan || null,
      description: compact(ipd.description || curated?.dataSharing?.note),
      infoTypes: ipd.infoTypes || [],
      timeFrame: compact(ipd.timeFrame),
      accessCriteria: compact(ipd.accessCriteria),
      url: ipd.url || null,
    },
    availableIpd: (references.availIpds || []).map((item) => ({
      id: item.id || null,
      type: item.type || null,
      url: item.url || null,
      comment: compact(item.comment),
    })),
    seeAlsoLinks: (references.seeAlsoLinks || []).map((item) => ({
      label: compact(item.label),
      url: item.url || null,
    })),
    curatedEvidence: curated ? {
      domain: curated.domain,
      evidenceRole: curated.evidenceRole || [],
      movementSignals: curated.movementSignals || [],
      referenceMethods: curated.referenceMethods || [],
      tasks: curated.tasks || [],
      axionUse: curated.axionUse || null,
      directAxionValidation: false,
    } : null,
    clinicalValidationStatus: "does_not_validate_axion",
  };
}

async function fetchStudy(nctId, timeoutMs) {
  return requestJson(`${API_BASE}/studies/${encodeURIComponent(nctId)}`, timeoutMs);
}

async function discoverStudyIds(timeoutMs, maximum) {
  const ids = new Set();
  for (const term of SEARCH_TERMS) {
    if (ids.size >= maximum) break;
    const url = new URL(`${API_BASE}/studies`);
    url.searchParams.set("format", "json");
    url.searchParams.set("pageSize", String(Math.min(100, Math.max(10, maximum))));
    url.searchParams.set("query.term", term);
    const response = await requestJson(url, timeoutMs);
    for (const study of response.studies || []) {
      const id = study?.protocolSection?.identificationModule?.nctId;
      if (id) ids.add(id);
      if (ids.size >= maximum) break;
    }
  }
  return [...ids];
}

async function main() {
  const options = args();
  const seed = JSON.parse(await readFile(SEED_PATH, "utf8"));
  const curatedById = new Map((seed.studies || []).map((study) => [study.nctId, study]));
  const requested = new Set(curatedById.keys());

  if (options.discover) {
    for (const nctId of await discoverStudyIds(options.timeoutMs, options.maxDiscovered)) requested.add(nctId);
  }

  const studies = [];
  const failures = [];
  for (const nctId of requested) {
    try {
      const raw = await fetchStudy(nctId, options.timeoutMs);
      studies.push(normalizeStudy(raw, curatedById.get(nctId) || null));
    } catch (error) {
      failures.push({ nctId, error: error?.message || String(error) });
    }
  }

  const registry = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "ClinicalTrials.gov API v2",
    apiBase: API_BASE,
    purpose: "Research discovery, feature prioritization and validation planning. This registry is not clinical validation of Axion.",
    searchTerms: options.discover ? [...SEARCH_TERMS] : [],
    requestedStudies: requested.size,
    retrievedStudies: studies.length,
    failedStudies: failures,
    studies: studies.sort((a, b) => String(a.nctId).localeCompare(String(b.nctId))),
  };

  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    output: options.output,
    requested: registry.requestedStudies,
    retrieved: registry.retrievedStudies,
    failures: failures.length,
    discovered: options.discover,
  }, null, 2));

  if (failures.length === requested.size) process.exitCode = 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}

export { normalizeStudy };
