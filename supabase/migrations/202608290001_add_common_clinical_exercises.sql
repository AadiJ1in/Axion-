-- Extend the private therapist allowlist with common movements that have an
-- explicit, deterministic on-device pose profile. Browser roles retain no
-- direct access to this table; publication remains therapist-RPC controlled.

insert into private.exercise_catalog (exercise_key, display_name, category, tracking_mode, joint) values
  ('band_shoulder_extension', 'Band Shoulder Extension', 'Shoulders', 'pose_reps', 'shoulder'),
  ('bent_leg_raise', 'Bent-Leg Raise', 'Core & abs', 'pose_reps', 'hip'),
  ('lower_trunk_rotation', 'Lower Trunk Rotation', 'Lower back', 'pose_reps', 'spine'),
  ('short_arc_quad', 'Short-Arc Quadriceps Extension', 'Thighs & quads', 'pose_reps', 'knee'),
  ('seated_knee_flexion', 'Seated Knee Flexion', 'Knees', 'pose_reps', 'knee'),
  ('supported_side_stepping', 'Supported Side Stepping', 'Balance', 'pose_reps', 'hip'),
  ('lateral_toe_tap', 'Supported Lateral Toe Tap', 'Balance', 'pose_reps', 'hip')
on conflict (exercise_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  tracking_mode = excluded.tracking_mode,
  joint = excluded.joint,
  active = true,
  updated_at = now();

revoke all on table private.exercise_catalog from public, anon, authenticated;
