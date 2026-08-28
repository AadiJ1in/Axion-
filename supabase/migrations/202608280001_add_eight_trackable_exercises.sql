-- Add only movements with an explicit, tested on-device pose profile. The table
-- remains private: authenticated clients prescribe through the therapist-only RPC.

insert into private.exercise_catalog (exercise_key, display_name, category, tracking_mode, joint) values
  ('shoulder_scaption', 'Shoulder Scaption', 'Shoulders', 'pose_reps', 'shoulder'),
  ('serratus_wall_slide', 'Serratus Wall Slide', 'Shoulders', 'pose_reps', 'shoulder'),
  ('standing_side_bend', 'Standing Side Bend', 'Core & abs', 'pose_reps', 'spine'),
  ('quadruped_rock_back', 'Quadruped Rock Back', 'Lower back', 'pose_reps', 'spine'),
  ('standing_hip_flexion', 'Supported Standing Hip Flexion', 'Hips & glutes', 'pose_reps', 'hip'),
  ('standing_hip_extension', 'Supported Standing Hip Extension', 'Hips & glutes', 'pose_reps', 'hip'),
  ('lateral_step_up', 'Lateral Step-Up', 'Knees', 'pose_reps', 'knee'),
  ('seated_march', 'Seated March', 'Balance', 'pose_reps', 'hip')
on conflict (exercise_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  tracking_mode = excluded.tracking_mode,
  joint = excluded.joint,
  active = true,
  updated_at = now();

revoke all on table private.exercise_catalog from public, anon, authenticated;
