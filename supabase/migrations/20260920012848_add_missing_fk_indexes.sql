create index if not exists assignment_clinical_review_targets_updated_by_idx
  on public.assignment_clinical_review_targets (updated_by);

create index if not exists therapist_patient_reviews_patient_id_idx
  on public.therapist_patient_reviews (patient_id);
