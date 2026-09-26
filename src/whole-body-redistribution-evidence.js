import { WHOLE_BODY_REGIONS } from "./whole-body-biomechanics.js";
import { balanceCoordinate, closeComposition } from "./whole-body-compositional-statistics.js";
import { analyzeWholeBodyRedistributionHistory } from "./whole-body-redistribution-history.js";
import { robustTwoWindowEvidence } from "./whole-body-robust-evidence.js";

// AxionWBF redistribution evidence v1.
// Adds resampling uncertainty/effect-size requirements to the longitudinal
// redistribution analysis. This remains descriptive research output.

export const WHOLE_BODY_REDISTRIBUTION_EVIDENCE_SCHEMA_VERSION = 1;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

function bodySummary(session) {
  return session?.movement_summary?.whole_body_v1
    || session?.movement_summary?.wholeBodyV1
    || session?.whole_body_v1
    || null;
}

function distribution(session) {
  const value = bodySummary(session)?.movementDistribution;
  return value?.status === "available" ? value : null;
}

function sessionComposition(session) {
  const center = distribution(session)?.compositionalStatistics?.sessionCenter;
  if (!center) return null;
  const values = WHOLE_BODY_REGIONS.map((region) => finite(center[region]));
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  return closeComposition(values);
}

function indices(regions = []) {
  return regions.map((region) => WHOLE_BODY_REGIONS.indexOf(region)).filter((index) => index >= 0);
}

function dateMs(session) {
  const raw = session?.completed_at || session?.created_at || session?.started_at;
  const parsed = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function analyzeWholeBodyRedistributionEvidence(sessions = [], options = {}) {
  const history = analyzeWholeBodyRedistributionHistory(sessions, options);
  if (history?.status !== "available") {
    return {
      schemaVersion: WHOLE_BODY_REDISTRIBUTION_EVIDENCE_SCHEMA_VERSION,
      status: "unavailable",
      clinicalStatus: "descriptive_unvalidated",
      reason: history?.reason || "history_unavailable",
      history,
    };
  }

  const expectation = history.expectation || distribution(sessions.find((session) => distribution(session)))?.expectation;
  const primary = indices(expectation?.primaryRegions);
  const outside = indices(expectation?.outsideRegions);
  if (!primary.length || !outside.length) {
    return {
      schemaVersion: WHOLE_BODY_REDISTRIBUTION_EVIDENCE_SCHEMA_VERSION,
      status: "unavailable",
      clinicalStatus: "descriptive_unvalidated",
      reason: "invalid_primary_outside_balance",
      history,
    };
  }

  const ordered = sessions
    .filter((session) => distribution(session) && sessionComposition(session) && dateMs(session) !== null)
    .sort((a, b) => dateMs(a) - dateMs(b));
  const baselineCount = history.baselineWindow?.count || options.baselineWindow || 3;
  const recentCount = history.recentWindow?.count || options.recentWindow || 3;
  const baselineSessions = ordered.slice(0, baselineCount);
  const recentSessions = ordered.slice(-recentCount);

  const balance = (session) => balanceCoordinate(sessionComposition(session), primary, outside);
  const baselineBalances = baselineSessions.map(balance).filter(Number.isFinite);
  const recentBalances = recentSessions.map(balance).filter(Number.isFinite);
  const primaryOutsideEvidence = robustTwoWindowEvidence(baselineBalances, recentBalances, {
    iterations: options.bootstrapIterations || 1500,
    seed: options.bootstrapSeed || 20260926,
    confidence: options.bootstrapConfidence || 0.95,
  });

  // Lower primary-vs-outside log balance means the composition shifted relatively
  // toward outside regions. Require the uncertainty layer to agree with that direction.
  const evidenceAgrees = Boolean(
    primaryOutsideEvidence
    && primaryOutsideEvidence.medianDifference < 0
    && primaryOutsideEvidence.cliffsDeltaRecentVsBaseline < 0
    && ["supported", "stable"].includes(primaryOutsideEvidence.evidenceTier)
  );
  const stableCandidate = Boolean(history.redistributionCandidate && evidenceAgrees);

  return {
    schemaVersion: WHOLE_BODY_REDISTRIBUTION_EVIDENCE_SCHEMA_VERSION,
    status: "available",
    clinicalStatus: "descriptive_unvalidated",
    historySchemaVersion: history.schemaVersion,
    history,
    uncertainty: {
      primaryVsOutsideLogBalance: primaryOutsideEvidence,
    },
    candidate: stableCandidate ? {
      ...history.redistributionCandidate,
      evidenceTier: primaryOutsideEvidence.evidenceTier,
      balanceMedianDifference: primaryOutsideEvidence.medianDifference,
      balanceCliffsDelta: primaryOutsideEvidence.cliffsDeltaRecentVsBaseline,
      balanceBootstrap95: {
        lower: primaryOutsideEvidence.bootstrap?.lower ?? null,
        upper: primaryOutsideEvidence.bootstrap?.upper ?? null,
        excludesZero: primaryOutsideEvidence.bootstrap?.excludesZero ?? false,
      },
      directionalStability: primaryOutsideEvidence.bootstrap?.directionalStability ?? null,
    } : null,
    interpretation: stableCandidate
      ? "The longitudinal WBF redistribution rule and an independent robust uncertainty/effect-size analysis agree on a relative shift from primary toward outside movement regions. This remains a descriptive research signal and does not establish mechanical load transfer, pathology, causation, injury risk, or treatment effect."
      : "The available longitudinal pattern did not satisfy both the redistribution rule and the independent robust uncertainty/effect-size evidence layer.",
  };
}
