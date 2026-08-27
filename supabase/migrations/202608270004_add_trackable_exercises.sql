-- Add clinician-reviewed movements that have explicit client-side pose profiles.
-- This private allowlist remains inaccessible through the Data API; only the
-- therapist-only plan publication function can resolve these keys.

insert into private.exercise_catalog (exercise_key, display_name, category, tracking_mode, joint) values
  ('assisted_shoulder_flexion', 'Assisted Shoulder Flexion', 'Shoulders', 'pose_reps', 'shoulder'),
  ('standing_shoulder_abduction', 'Standing Shoulder Abduction', 'Shoulders', 'pose_reps', 'shoulder'),
  ('sit_to_stand', 'Sit-to-Stand', 'Thighs & quads', 'pose_reps', 'knee'),
  ('forward_lunge', 'Supported Forward Lunge', 'Knees', 'pose_reps', 'knee'),
  ('standing_hip_abduction', 'Standing Hip Abduction', 'Hips & glutes', 'pose_reps', 'hip'),
  ('seated_calf_raise', 'Seated Calf Raise', 'Calves & shins', 'pose_reps', 'ankle'),
  ('ankle_pumps', 'Ankle Pumps', 'Ankles & feet', 'pose_reps', 'ankle'),
  ('marching_in_place', 'Supported Marching in Place', 'Balance', 'pose_reps', 'hip')
on conflict (exercise_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  tracking_mode = excluded.tracking_mode,
  joint = excluded.joint,
  active = true,
  updated_at = now();

revoke all on table private.exercise_catalog from public, anon, authenticated;
