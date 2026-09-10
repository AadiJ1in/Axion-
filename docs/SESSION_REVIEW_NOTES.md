# Session-specific therapist notes

Axion's detailed therapist post-session review now supports notes attached to one completed exercise session.

## Workflow

From a patient check-in / completed session row, the treating therapist opens the detailed post-session review. The review can show a **Therapist-only session notes** section with:

- existing notes attached to that specific session,
- note timestamps,
- a field to add another clinically relevant review note.

The note remains separate from patient-reported pain/confidence and pose-derived movement measurements.

## Authorization

No new database table or privilege path is introduced. Session notes use the existing `therapist_notes` table and its current RLS policies:

- only the authenticated therapist with an active therapist-patient relationship can insert a note,
- when `session_id` is supplied, the referenced session must belong to that same patient,
- only the assigned therapist can read the therapist note under the current policy model.

The database already limits therapist notes to 1–4,000 characters and links `session_id` to `exercise_sessions`.

## Clinical boundary

Saving a session note does not:

- change a prescription or therapist review target,
- change roadmap completion or progression,
- add/remove a clinical repetition,
- modify the patient's submitted movement/session record,
- diagnose a condition.

It documents the treating therapist's review of an already completed session.
