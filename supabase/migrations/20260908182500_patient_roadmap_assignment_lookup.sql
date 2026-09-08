create or replace function public.get_patient_roadmap_node_assignments(p_plan_id uuid)
returns table (
  roadmap_node_id uuid,
  assignment_id uuid,
  sequence integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    rna.roadmap_node_id,
    rna.assignment_id,
    rna.sequence::integer
  from public.roadmap_node_assignments rna
  join public.roadmap_nodes rn on rn.id = rna.roadmap_node_id
  join public.exercise_plans ep on ep.id = rn.plan_id
  where rn.plan_id = p_plan_id
    and ep.patient_id = auth.uid()
  order by rn.session_number, rna.sequence;
$$;

grant execute on function public.get_patient_roadmap_node_assignments(uuid) to authenticated;
