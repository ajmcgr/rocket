-- Rocket's production database requires a WHERE clause on DELETE. Keep the
-- existing transactional snapshot computation unchanged, replacing only its
-- two full-snapshot deletes with predicates on non-null primary keys.
do $$
declare v_definition text;
begin
  v_definition := pg_catalog.pg_get_functiondef(
    'public.refresh_launch_intelligence()'::pg_catalog.regprocedure
  );
  if pg_catalog.strpos(v_definition, 'delete from app_graph.app_intelligence;') = 0
     or pg_catalog.strpos(v_definition, 'delete from app_graph.category_intelligence;') = 0 then
    raise exception 'Unexpected intelligence refresh definition';
  end if;
  v_definition := pg_catalog.replace(v_definition,
    'delete from app_graph.app_intelligence;',
    'delete from app_graph.app_intelligence where app_id is not null;');
  v_definition := pg_catalog.replace(v_definition,
    'delete from app_graph.category_intelligence;',
    'delete from app_graph.category_intelligence where category is not null;');
  execute v_definition;
end;
$$;
