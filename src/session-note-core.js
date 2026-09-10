export function normalizeTherapistNote(value, maxLength = 4000) {
  const normalized = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized.slice(0, Math.max(1, Number(maxLength) || 4000));
}

export function therapistNotePreview(value, maxLength = 140) {
  const normalized = normalizeTherapistNote(value, 4000).replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function sortTherapistNotes(notes = []) {
  return [...notes].sort((a, b) => {
    const left = new Date(a.created_at || 0).getTime();
    const right = new Date(b.created_at || 0).getTime();
    return right - left;
  });
}
