import fs from "node:fs";
import path from "node:path";
import { extractWholeBodyBiomechanics } from "../../src/biomechanics-feature-core.js";
import {
  UI_PRMD_ADAPTER_METADATA,
  parseUiPrmdSegmentFilename,
  reconstructUiPrmdKinectSequence,
  uiPrmdKinectToAxionLandmarks,
} from "./ui-prmd-adapter.mjs";

const root = path.resolve(process.env.UI_PRMD_ROOT || process.argv[2] || "");
const outputPath = process.env.UI_PRMD_OUTPUT
  ? path.resolve(process.env.UI_PRMD_OUTPUT)
  : null;

if (!process.env.UI_PRMD_ROOT && !process.argv[2]) {
  console.log("UI-PRMD benchmark skipped: set UI_PRMD_ROOT or pass the dataset root as the first argument.");
  process.exit(0);
}
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  throw new Error(`UI_PRMD_ROOT_NOT_FOUND ${root}`);
}

const VALIDATION_METRICS = Object.freeze([
  "knee_flexion_deg",
  "knee_flexion_asymmetry_deg",
  "trunk_pelvis_lateral_deviation_3d_deg",
  "shoulder_pelvis_axis_mismatch_3d_deg",
  "hip_flexion_asymmetry_3d_deg",
  "knee_mediolateral_offset_3d_proxy",
  "pelvis_over_stance_offset_3d_proxy",
]);

function walk(directory) {
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function percentile(values, q) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const fraction = position - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

function summarize(values) {
  const usable = values.filter(Number.isFinite);
  if (!usable.length) return null;
  const p10 = percentile(usable, 0.10);
  const median = percentile(usable, 0.50);
  const p90 = percentile(usable, 0.90);
  return {
    frameCoverage: usable.length,
    p10,
    median,
    p90,
    robustExcursion: p90 - p10,
    min: Math.min(...usable),
    max: Math.max(...usable),
  };
}

function candidateAnglePaths(positionPath) {
  const angleName = path.basename(positionPath).replace(/_positions\.txt$/i, "_angles.txt");
  const sameDirectory = path.join(path.dirname(positionPath), angleName);
  const parts = positionPath.split(path.sep);
  const mappedParts = parts.map((part) => /^positions$/i.test(part) ? "Angles" : part);
  mappedParts[mappedParts.length - 1] = angleName;
  return [...new Set([sameDirectory, mappedParts.join(path.sep)])];
}

const allFiles = walk(root);
const positionFiles = allFiles.filter((file) => /m\d{2}_s\d{2}_e\d{2}_positions\.txt$/i.test(path.basename(file)));
const angleFilesByName = new Map();
for (const file of allFiles.filter((item) => /m\d{2}_s\d{2}_e\d{2}_angles\.txt$/i.test(path.basename(item)))) {
  const key = path.basename(file).toLowerCase();
  if (!angleFilesByName.has(key)) angleFilesByName.set(key, []);
  angleFilesByName.get(key).push(file);
}

function findAngleFile(positionPath) {
  for (const candidate of candidateAnglePaths(positionPath)) {
    if (fs.existsSync(candidate)) return candidate;
  }
  const key = path.basename(positionPath).replace(/_positions\.txt$/i, "_angles.txt").toLowerCase();
  const candidates = angleFilesByName.get(key) || [];
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const relative = path.relative(root, positionPath).toLowerCase();
    const contextual = candidates.find((candidate) => {
      const candidateRelative = path.relative(root, candidate).toLowerCase();
      const sharedTokens = ["correct", "incorrect", "kinect", "segmented"].filter((token) =>
        relative.includes(token) && candidateRelative.includes(token));
      return sharedTokens.length >= 2;
    });
    if (contextual) return contextual;
  }
  return null;
}

function metricIdentity(metric) {
  return `${metric.metricKey}|${metric.side}`;
}

function benchmarkEpisode(positionFile, angleFile, parsed) {
  const positionText = fs.readFileSync(positionFile, "utf8");
  const angleText = fs.readFileSync(angleFile, "utf8");
  const skeletonFrames = reconstructUiPrmdKinectSequence(positionText, angleText);
  const samples = new Map();

  for (const skeleton of skeletonFrames) {
    const landmarks = uiPrmdKinectToAxionLandmarks(skeleton);
    const metrics = extractWholeBodyBiomechanics(landmarks, {
      source: "ui_prmd_kinect_reconstruction",
      cameraView: "dataset",
    }).filter((metric) => VALIDATION_METRICS.includes(metric.metricKey));

    for (const metric of metrics) {
      const key = metricIdentity(metric);
      if (!samples.has(key)) {
        samples.set(key, {
          metricKey: metric.metricKey,
          region: metric.region,
          side: metric.side,
          unit: metric.unit,
          values: [],
        });
      }
      samples.get(key).values.push(Number(metric.value));
    }
  }

  return {
    movementKey: parsed.movementKey,
    movementName: parsed.movement?.name || parsed.movementKey,
    axionExerciseKey: parsed.movement?.axionExerciseKey || null,
    benchmarkScope: parsed.movement?.benchmarkScope || "research_only",
    subjectKey: parsed.subjectKey,
    episodeKey: parsed.episodeKey,
    sourceFrameRateHz: UI_PRMD_ADAPTER_METADATA.sourceFrameRateHz,
    frameCount: skeletonFrames.length,
    durationSeconds: skeletonFrames.length / UI_PRMD_ADAPTER_METADATA.sourceFrameRateHz,
    sourceFiles: {
      positions: path.relative(root, positionFile),
      angles: path.relative(root, angleFile),
    },
    metrics: [...samples.values()].map((entry) => ({
      metricKey: entry.metricKey,
      region: entry.region,
      side: entry.side,
      unit: entry.unit,
      ...summarize(entry.values),
    })),
  };
}

const supportedPositions = positionFiles
  .map((file) => ({ file, parsed: parseUiPrmdSegmentFilename(path.basename(file)) }))
  .filter((item) => item.parsed?.movement?.axionExerciseKey);

const episodes = [];
const skipped = [];
for (const { file, parsed } of supportedPositions) {
  const angleFile = findAngleFile(file);
  if (!angleFile) {
    skipped.push({ file: path.relative(root, file), reason: "angle_pair_not_found" });
    continue;
  }
  try {
    episodes.push(benchmarkEpisode(file, angleFile, parsed));
  } catch (error) {
    skipped.push({
      file: path.relative(root, file),
      reason: String(error?.message || error),
    });
  }
}

function aggregateMovement(movementKey) {
  const rows = episodes.filter((episode) => episode.movementKey === movementKey);
  if (!rows.length) return null;
  const subjects = new Set(rows.map((row) => row.subjectKey));
  const frames = rows.map((row) => row.frameCount);
  const metricCoverage = {};
  for (const metricKey of VALIDATION_METRICS) {
    const episodeMatches = rows.map((row) => row.metrics.filter((metric) => metric.metricKey === metricKey));
    const matched = episodeMatches.flat();
    metricCoverage[metricKey] = {
      episodeCount: episodeMatches.filter((metrics) => metrics.length > 0).length,
      episodeCoverageFraction: rows.length
        ? episodeMatches.filter((metrics) => metrics.length > 0).length / rows.length
        : 0,
      sideSummaries: matched.length,
    };
  }
  return {
    movementKey,
    movementName: rows[0].movementName,
    axionExerciseKey: rows[0].axionExerciseKey,
    benchmarkScope: rows[0].benchmarkScope,
    episodes: rows.length,
    subjects: subjects.size,
    medianFrameCount: percentile(frames, 0.5),
    metricCoverage,
  };
}

const movementKeys = [...new Set(episodes.map((episode) => episode.movementKey))].sort();
const result = {
  benchmark: "ui-prmd-kinect-to-axion-world-v2",
  generatedAt: new Date().toISOString(),
  adapter: UI_PRMD_ADAPTER_METADATA,
  validationClaims: {
    supported: [
      "file parsing and skeletal reconstruction",
      "Axion world-v2 feature extraction on an external rehabilitation-motion dataset",
      "per-episode kinematic feature coverage and repeatability analysis",
    ],
    unsupported: [
      "clinical validation of compensation migration",
      "injury diagnosis or injury-risk prediction",
      "patient outcome prediction",
      "force, joint-moment, or tissue-load estimation",
    ],
  },
  datasetRootIncludedInOutput: false,
  discoveredPositionFiles: positionFiles.length,
  benchmarkedEpisodes: episodes.length,
  skipped,
  movements: movementKeys.map(aggregateMovement).filter(Boolean),
  episodes,
};

if (!episodes.length) {
  throw new Error(`UI_PRMD_NO_SUPPORTED_EPISODES discovered_positions=${positionFiles.length} skipped=${skipped.length}`);
}

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n");
  console.log(`UI-PRMD benchmark written to ${outputPath}`);
}

console.log(`UI-PRMD benchmark complete: ${episodes.length} episodes across ${movementKeys.length} supported movements; ${skipped.length} skipped.`);
for (const movement of result.movements) {
  console.log(`${movement.movementKey} ${movement.movementName}: ${movement.episodes} episodes, ${movement.subjects} subjects`);
}
