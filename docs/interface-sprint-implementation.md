# Axion interface simplification sprint

Implementation goals for this branch:

- Preserve Axion's existing brand, clinical authority, tracking, persistence, roadmap progress, and safety boundaries.
- Make the public website explain rehabilitation before internal feature names.
- Reduce patient primary navigation to Today, Journey, Progress, and Profile.
- Move patient symptom reporting out of permanent navigation and present it as a contextual **Report a concern** action.
- Keep mobile patient navigation four-wide with safe-area support and 44px+ touch targets.
- Separate the Today job from the Journey job even though both continue to use the existing safe patient renderer underneath.
- Simplify active Movement Lab presentation to the camera/game, set/repetition progress, one coaching cue, Pause, Report a concern, and Finish Session.
- Keep technical diagnostics and detailed analytics out of the active patient exercise surface.
- Reduce therapist navigation to Overview, Patients, Plans, and Exercise Library; review/alert information is surfaced through Overview instead of a competing Alerts destination.
- Rename ambiguous report/recovery score language in the presentation layer where it can be done without changing persisted schemas.
- Label public example metrics as synthetic demo values.
- Compact the demo disclaimer while retaining the full nonclinical/synthetic/no-raw-video boundary in an accessible disclosure.
- Preserve the recently added 3–8 mission Journey chapter split.

## Standard / Adventure presentation

The underlying application already distinguishes standard exercise presentation from movement-game/adventure presentation. This branch adds a presentation-mode marker and professional standard-mode rest copy, but intentionally does not add a large preference/settings subsystem. A user-facing mode preference should be activated only after it can reuse the same assignment, tracker, rep-validation, session-save, and therapist-authority path with no duplicated clinical logic.

## CSS consolidation

No existing stylesheet is deleted in this branch. The migration plan is documented in `docs/ui-css-consolidation-plan.md`; deletions are deferred until page-by-page visual regression coverage exists.
