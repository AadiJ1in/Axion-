-- Cover the therapist override actor foreign key for audit/report joins.
create index roadmap_nodes_overridden_by_idx
  on public.roadmap_nodes (overridden_by)
  where overridden_by is not null;

