# Therapist review workflow

Axion's **Needs Attention** surface now supports a durable clinician review workflow without turning descriptive signals into automated treatment decisions.

## Review queue

For each actively connected patient, Axion can show:

- the treating therapist's latest review timestamp,
- new exercise sessions since that review,
- new patient safety/pain reports since that review,
- currently open stored therapist alerts,
- the latest therapist follow-up note.

The first review uses a bounded 30-day activity window instead of treating the patient's entire historical record as newly unreviewed.

The compact queue is computed server-side by `therapist_review_queue()` under the caller's existing RLS permissions. The function is `SECURITY INVOKER`; it does not bypass patient isolation.

## Recording a review

**Mark current changes reviewed** creates an append-only `therapist_patient_reviews` receipt containing:

- therapist ID,
- patient ID,
- review time,
- an optional therapist note,
- small descriptive count snapshots for the activity being reviewed.

When a review is recorded, currently open stored `therapist_alerts` for that treating therapist/patient are marked `reviewed`. Computed Needs Attention signals remain visible when their underlying data still warrants them.

Review receipts cannot update prescriptions, roadmap completion, patient session results, clinical rep counts, or clinical review targets.

## Follow-up notes

A therapist can add a patient-level follow-up note without marking the current activity reviewed. Notes use the existing RLS-protected `therapist_notes` table and are readable only by the assigned therapist under the current policy model.

## Clinical boundary

A review receipt means **the clinician reviewed the available Axion context**. It does not mean:

- Axion diagnosed a condition,
- Axion determined that treatment is safe or effective,
- a patient is cleared to progress,
- a review target was clinically achieved,
- an ongoing attention signal should disappear.

Treatment decisions remain with the treating clinician.
