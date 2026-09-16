# Axion UI CSS consolidation plan

This sprint intentionally does **not** perform a high-risk stylesheet rewrite. The current product has several overlapping presentation layers that are still carrying live selectors, so consolidation should happen only behind visual and browser regression checks.

## Target ownership

### `tokens.css`
Own global design tokens only:
- brand colors and semantic colors
- typography families and scale
- spacing
- radii
- shadows
- responsive constants
- motion/reduced-motion defaults

### `components.css`
Own reusable primitives only:
- buttons
- cards
- forms and form feedback
- badges and pills
- navigation primitives
- modals
- empty/loading/error states

### `public-site.css`
Own:
- homepage
- public navigation
- public product story
- role demo entry
- public responsive behavior

### `patient.css`
Own:
- Today
- Journey shell and patient navigation
- Progress
- Profile
- Report-a-concern entry points

### `therapist.css`
Own:
- Overview
- Patients
- patient record shell
- Plans
- Exercise Library

### `movement-lab.css`
Own:
- camera setup
- standard exercise session
- rest state
- session completion/summary handoff

### `games.css`
Own Adventure-mode presentation only. It must not own prescription, validation, session persistence, or clinical authority.

## Existing files to migrate, not delete yet

| Existing layer | Long-term destination |
| --- | --- |
| `styles.css` | tokens + components + page-specific owners |
| `clinic-readiness.css` | therapist + patient + movement-lab |
| `ui-hierarchy.css` | patient + therapist + components |
| `ui-hierarchy-p1.css` | patient + therapist + movement-lab |
| `journey-polish.css` | patient |
| `journey-ui-cleanup.css` | patient |
| `journey-visual-system-v2.css` | patient + games |
| `beacon-story.css` | games |
| `beacon-games.css` | games |
| `beacon-game-mode-hub.css` | games + movement-lab |
| `campaign-map.css` | patient + games |
| `region-restoration.css` | games |
| `patient-game-polish.css` | movement-lab + games |
| `patient-surface-polish.css` | patient |
| `interface-sprint.css` | temporary verified source for public/patient/therapist/movement-lab rules before migration |

## Safe migration sequence

1. Freeze visual behavior with responsive screenshots and RC1 browser tests.
2. Create `tokens.css`; move only declarations that are literal design tokens and leave aliases in the old files temporarily.
3. Create `components.css`; migrate one primitive at a time, starting with buttons/forms because their states are easiest to regression test.
4. Migrate the public site because it has the smallest clinical risk surface.
5. Migrate Patient Today/Progress/Profile, while leaving Journey/game visuals in place until their full map states are captured.
6. Migrate therapist shell and record hierarchy.
7. Migrate Movement Lab standard mode; verify camera setup, active exercise, rest, safety concern, and finish states before removing old selectors.
8. Move Journey/Adventure-only visuals into `games.css` last.
9. Delete an old selector only when code search finds no remaining dependency and Chromium/WebKit responsive checks remain green.

## Release gates for every consolidation step

- `npm run check`
- production build
- RC1 Chromium + WebKit tests
- no horizontal overflow at 1440, 1280, 1024, 768, 430, 390, 360, and 320 px
- keyboard focus smoke test
- reduced-motion check
- patient/therapist role separation unchanged
- no changes to assignment IDs, roadmap authority, rep validation, session persistence, or Supabase/RLS behavior

The goal is fewer style owners over time, not a cosmetic rewrite. Existing visuals remain authoritative until their replacement layer is verified.
