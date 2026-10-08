// Patient-reported symptoms; deliberately independent of camera inference.
export const WBF_SYMPTOM_SCHEMA_VERSION = 1;
export const WBF_SYMPTOM_REGIONS = Object.freeze([
  "neck","left_shoulder","right_shoulder","upper_back","lower_back","left_elbow","right_elbow",
  "left_wrist","right_wrist","left_hip","right_hip","pelvis","left_knee","right_knee",
  "left_ankle","right_ankle","left_foot","right_foot"
]);
export function recordWholeBodySymptom({ region, intensity, timestamp = new Date().toISOString(),
  exerciseKey = null, sessionId = null, note = "" } = {}) {
  if (!WBF_SYMPTOM_REGIONS.includes(region)) throw new Error("Unknown symptom region");
  if (!Number.isInteger(intensity) || intensity < 0 || intensity > 10) throw new Error("Pain rating must be integer 0–10");
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid symptom timestamp");
  return { schemaVersion: WBF_SYMPTOM_SCHEMA_VERSION, source: "patient_reported", region, intensity,
    timestamp: date.toISOString(), exerciseKey, sessionId, note: String(note).slice(0,500) };
}
export function summarizeWholeBodySymptomHistory(entries = []) {
  const valid = entries.filter(e => e?.source === "patient_reported" && WBF_SYMPTOM_REGIONS.includes(e.region)
    && Number.isInteger(e.intensity) && e.intensity >= 0 && e.intensity <= 10
    && Number.isFinite(new Date(e.timestamp).getTime()))
    .sort((a,b) => new Date(a.timestamp)-new Date(b.timestamp));
  const regions = WBF_SYMPTOM_REGIONS.map(region => {
    const series = valid.filter(e=>e.region===region);
    if (!series.length) return null;
    const first=series[0], last=series[series.length-1];
    return { region, observations:series.length, firstIntensity:first.intensity, latestIntensity:last.intensity,
      change:series.length>1 ? last.intensity-first.intensity : null, latestAt:last.timestamp };
  }).filter(Boolean);
  return { schemaVersion:WBF_SYMPTOM_SCHEMA_VERSION, source:"patient_reported",
    status:valid.length?"available":"insufficient_data", regions,
    warning:"Differences in reported pain location are not proof of pain migration or an injury mechanism." };
}
