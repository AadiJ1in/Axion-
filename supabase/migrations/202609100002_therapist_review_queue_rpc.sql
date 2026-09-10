-- Compact server-side review queue. SECURITY INVOKER intentionally preserves
-- the caller's RLS permissions; this function does not bypass patient isolation.

create or replace function public.therapist_review_queue()
returns table (
  patient_id uuid,
  last_reviewed_at timestamptz,
  first_review boolean,
  sessions_since_review bigint,
  safety_reports_since_review bigint,
  open_alerts bigint,
  latest_note text,
  latest_note_at timestamptz,
  newest_activity_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with active_patients as (
    select tp.patient_id
    from public.therapist_patients tp
    where tp.therapist_id = (select auth.uid())
      and tp.status = 'active'
      and (select private.current_app_role()) = 'therapist'::public.app_role
  ), last_reviews as (
    select r.patient_id, max(r.reviewed_at) as reviewed_at
    from public.therapist_patient_reviews r
    where r.therapist_id = (select auth.uid())
    group by r.patient_id
  )
  select
    ap.patient_id,
    lr.reviewed_at as last_reviewed_at,
    (lr.reviewed_at is null) as first_review,
    (
      select count(*)
      from public.exercise_sessions es
      where es.patient_id = ap.patient_id
        and coalesce(es.completed_at, es.created_at) > coalesce(lr.reviewed_at, now() - interval '30 days')
    ) as sessions_since_review,
    (
      select count(*)
      from public.patient_safety_events pse
      where pse.patient_id = ap.patient_id
        and pse.created_at > coalesce(lr.reviewed_at, now() - interval '30 days')
    ) as safety_reports_since_review,
    (
      select count(*)
      from public.therapist_alerts ta
      where ta.therapist_id = (select auth.uid())
        and ta.patient_id = ap.patient_id
        and ta.status = 'open'
    ) as open_alerts,
    note_row.note as latest_note,
    note_row.created_at as latest_note_at,
    greatest(
      (
        select max(coalesce(es.completed_at, es.created_at))
        from public.exercise_sessions es
        where es.patient_id = ap.patient_id
          and coalesce(es.completed_at, es.created_at) > coalesce(lr.reviewed_at, now() - interval '30 days')
      ),
      (
        select max(pse.created_at)
        from public.patient_safety_events pse
        where pse.patient_id = ap.patient_id
          and pse.created_at > coalesce(lr.reviewed_at, now() - interval '30 days')
      ),
      (
        select max(ta.created_at)
        from public.therapist_alerts ta
        where ta.therapist_id = (select auth.uid())
          and ta.patient_id = ap.patient_id
          and ta.status = 'open'
      )
    ) as newest_activity_at
  from active_patients ap
  left join last_reviews lr on lr.patient_id = ap.patient_id
  left join lateral (
    select tn.note, tn.created_at
    from public.therapist_notes tn
    where tn.therapist_id = (select auth.uid())
      and tn.patient_id = ap.patient_id
    order by tn.created_at desc
    limit 1
  ) note_row on true;
$$;

revoke all on function public.therapist_review_queue() from public;
grant execute on function public.therapist_review_queue() to authenticated;

comment on function public.therapist_review_queue() is
  'RLS-scoped treating-therapist summary of activity since the latest review receipt. First review uses a 30-day lookback.';
