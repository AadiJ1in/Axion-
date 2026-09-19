const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

const humanize = (value = "") => String(value)
  .replaceAll("_", " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

function familyLabel(analysis, familyName) {
  const family = (analysis?.familyShifts || []).find((item) => item.family === familyName);
  return family?.strongestFeatureLabel || humanize(familyName || "movement feature");
}

function pendingMessage(analysis = {}) {
  switch (analysis.reason) {
    case "data_unavailable":
      return "Longitudinal movement data could not be loaded for this review. No movement conclusion is shown from incomplete data.";
    case "insufficient_sessions": {
      const available = finite(analysis.availableSessions);
      const required = finite(analysis.requiredSessions);
      if (available !== null && required !== null) {
        return `Axion has ${available} reliable same-exercise session${available === 1 ? "" : "s"}; ${required} are required before longitudinal review.`;
      }
      return "More reliable same-exercise sessions are required before longitudinal review.";
    }
    case "observation_window_too_short": {
      const span = finite(analysis.observationSpanDays);
      const required = finite(analysis.requiredObservationSpanDays);
      if (span !== null && required !== null) {
        return `The current evidence spans ${span.toFixed(1)} days; at least ${required} days are required before Axion treats the pattern as longitudinal.`;
      }
      return "The observation window is still too short for longitudinal review.";
    }
    case "mixed_capture_context":
      return "Camera setup changed across the comparison window, so Axion will not pool those sessions.";
    case "mixed_prescribed_side":
      return "Prescribed side changed across the comparison window, so Axion will not pool those sessions.";
    case "mixed_exercises":
      return "Only repeated sessions of the same exercise can be compared in this review.";
    case "duplicate_sessions":
      return "Duplicate session records must be resolved before longitudinal review.";
    default:
      return "There is not enough verified same-exercise biomechanics evidence for longitudinal review yet.";
  }
}

export function compensationMigrationReviewModel(analysis = {}) {
  const disclaimer = "Descriptive movement-pattern review only. This does not diagnose injury, estimate tissue load, establish causation, predict injury risk, or recommend treatment changes.";
  if (analysis?.status !== "available") {
    const dataUnavailable = analysis?.reason === "data_unavailable";
    return {
      status: dataUnavailable ? "unavailable" : "pending",
      badge: dataUnavailable ? "Review unavailable" : "Evidence pending",
      title: dataUnavailable ? "Longitudinal movement review unavailable" : "Longitudinal movement review is still building",
      message: pendingMessage(analysis),
      sessionCount: finite(analysis.availableSessions),
      observationSpanDays: finite(analysis.observationSpanDays),
      evidenceQualityPercent: null,
      candidates: [],
      limitations: [],
      disclaimer,
    };
  }

  const rawCandidates = Array.isArray(analysis.redistributionCandidates)
    ? analysis.redistributionCandidates
    : [];
  const candidates = rawCandidates.slice(0, 3).map((candidate) => {
    const decreasingLabel = familyLabel(analysis, candidate.decreasingFamily);
    const increasingLabel = familyLabel(analysis, candidate.increasingFamily);
    return {
      decreasingFamily: candidate.decreasingFamily,
      increasingFamily: candidate.increasingFamily,
      decreasingLabel,
      increasingLabel,
      statement: `${decreasingLabel} decreased while ${increasingLabel} increased relative to this patient's early same-exercise sessions.`,
    };
  });
  const hasCandidate = candidates.length > 0;
  const evidenceQuality = finite(analysis?.quality?.averageEvidenceQuality);

  return {
    status: hasCandidate ? "review" : "monitoring",
    badge: hasCandidate ? "Clinician review" : "Monitoring",
    title: hasCandidate ? "Possible movement redistribution pattern" : "No sustained inverse movement pattern",
    message: hasCandidate
      ? "A persistent inverse change appeared across movement-feature families during repeated sessions of the same exercise. Review it alongside symptoms, examination findings, and capture consistency."
      : "No persistent, directionally consistent inverse cross-family change met the current descriptive threshold.",
    sessionCount: finite(analysis.sessionCount),
    observationSpanDays: finite(analysis.observationSpanDays),
    evidenceQualityPercent: evidenceQuality === null ? null : Math.round(evidenceQuality * 100),
    candidates,
    limitations: Array.isArray(analysis.limitations) ? analysis.limitations.slice(0, 4) : [],
    disclaimer,
  };
}
