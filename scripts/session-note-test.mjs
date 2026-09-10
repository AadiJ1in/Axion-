import assert from "node:assert/strict";
import { normalizeTherapistNote, sortTherapistNotes, therapistNotePreview } from "../src/session-note-core.js";

assert.equal(
  normalizeTherapistNote("  Reviewed   squat form.\r\n  Continue current plan.  \r\n\r\n\r\n Follow up next visit. "),
  "Reviewed squat form.\nContinue current plan.\n\nFollow up next visit."
);
assert.equal(normalizeTherapistNote("   "), "");
assert.equal(normalizeTherapistNote("abcdef", 4), "abcd");
assert.equal(therapistNotePreview("Short review note", 40), "Short review note");
assert.equal(therapistNotePreview("This is a longer therapist review note that should be shortened", 24), "This is a longer therap…");

const sorted = sortTherapistNotes([
  { id: "older", created_at: "2026-09-08T12:00:00Z" },
  { id: "newer", created_at: "2026-09-10T01:00:00Z" },
  { id: "middle", created_at: "2026-09-09T18:00:00Z" },
]);
assert.deepEqual(sorted.map((note) => note.id), ["newer", "middle", "older"]);

console.log("session-specific therapist note helpers: ok");
