-- The frontend now has an explicit calibrated tracking profile for every dynamic
-- catalog exercise. Keep the private server allowlist and existing assignments in
-- sync so reports describe camera-counted repetitions accurately.

update private.exercise_catalog
set tracking_mode = 'pose_reps', updated_at = now()
where active and tracking_mode = 'guided_reps';

update public.exercise_assignments assignment
set tracking_mode = catalog.tracking_mode, updated_at = now()
from private.exercise_catalog catalog
where assignment.exercise_key = catalog.exercise_key
  and assignment.status = 'active'
  and assignment.tracking_mode is distinct from catalog.tracking_mode;
