# Published plan version history

Axion's treatment-plan publisher already preserves prior versions: publishing a new active plan archives the prior active plan and creates a new plan plus a new assignment set. This feature exposes that existing version history instead of maintaining a second audit copy.

## Patient experience

On the Roadmap, a patient can see:

- the currently published therapist plan,
- when it was published,
- whether a prior stored version exists,
- a read-only **See what changed** comparison.

The comparison can show:

- roadmap title/program/phase changes,
- plan duration and sessions-per-week changes,
- Game Mode enablement changes,
- exercises added or removed,
- sets, reps, hold duration, rest, prescribed side, exercise mode, status, and ordering changes,
- that instructions changed, without duplicating historical free-text instructions into the comparison UI.

The patient-facing boundary states explicitly that Axion did not independently change treatment; the history reflects plans published by the treating therapist.

## Therapist experience

The therapist roadmap builder shows a read-only list of stored published versions for the selected patient. A therapist can compare adjacent versions, but the history UI does not provide a one-click rollback or automatic prescription change.

## Data and authorization

No new treatment data store is introduced. Version history reads the existing RLS-protected `exercise_plans` and `exercise_assignments` tables. Participants can only read plan records already authorized by the existing policies.

## Clinical boundary

Version comparison is an audit/communication feature. It does not:

- determine whether a plan change was clinically appropriate,
- recommend reverting or progressing treatment,
- change the active prescription,
- validate or invalidate clinical repetitions,
- modify roadmap completion.
