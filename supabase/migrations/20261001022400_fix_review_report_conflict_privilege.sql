-- A targeted ON CONFLICT needs SELECT on its arbiter columns. Reports are
-- intentionally write-only to authenticated users, so use untargeted DO NOTHING.
create or replace function public.report_app_review(p_review_id uuid, p_reason text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or char_length(btrim(p_reason)) not between 10 and 500 then
    raise exception 'Invalid report';
  end if;
  insert into app_graph.app_review_reports(review_id, reporter_id, reason)
    values (p_review_id, auth.uid(), btrim(p_reason))
    on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.report_app_review(uuid, text) from public, anon;
grant execute on function public.report_app_review(uuid, text) to authenticated;
