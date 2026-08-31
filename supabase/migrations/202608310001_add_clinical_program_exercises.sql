-- Add common clinic movements with explicit on-device tracking contracts.
-- The allowlist remains private and is reachable only through the validated
-- therapist plan-publication RPC.

insert into private.exercise_catalog (exercise_key, display_name, category, tracking_mode, joint) values
  ('side_lying_shoulder_external_rotation', 'Side-Lying Shoulder External Rotation', 'Shoulders', 'pose_reps', 'shoulder'),
  ('prone_y_raise', 'Prone Y Raise', 'Upper back', 'pose_reps', 'shoulder'),
  ('half_kneeling_hip_flexor_stretch', 'Supported Half-Kneeling Hip Flexor Stretch', 'Hips & glutes', 'timed_hold', 'hip'),
  ('lateral_band_walk', 'Lateral Band Walk', 'Hips & glutes', 'pose_reps', 'hip'),
  ('quadriceps_set', 'Quadriceps Set', 'Thighs & quads', 'timed_hold', 'knee'),
  ('hamstring_bridge', 'Hamstring Bridge', 'Hamstrings', 'pose_reps', 'hip'),
  ('supported_weight_shift', 'Supported Forward and Back Weight Shift', 'Balance', 'pose_reps', 'hip'),
  ('standing_clock_reach', 'Supported Clock Reach', 'Balance', 'pose_reps', 'hip')
on conflict (exercise_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  tracking_mode = excluded.tracking_mode,
  joint = excluded.joint,
  active = true,
  updated_at = now();

revoke all on table private.exercise_catalog from public, anon, authenticated;
