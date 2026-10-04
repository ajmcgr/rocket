-- Self-reported listing details are not proof of app ownership or payment access.
create table public.app_submission_details (
  app_id uuid primary key references app_graph.apps(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  details jsonb not null check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
alter table public.app_submission_details enable row level security;
revoke all on public.app_submission_details from public, anon, authenticated;
grant select (app_id, details, created_at) on public.app_submission_details to anon, authenticated;
grant all on public.app_submission_details to service_role;
create policy "Public details of published submissions" on public.app_submission_details
  for select to anon, authenticated using (
    exists (select 1 from app_graph.apps a where a.id = app_id and a.is_public)
  );
create view public.public_app_submission_details with (security_invoker = true) as
select app_id, details, created_at from public.app_submission_details;
revoke all on public.public_app_submission_details from public;
grant select on public.public_app_submission_details to anon, authenticated;

create function public.publish_new_app_submission(p_user_id uuid, p_app_id uuid, p_details jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_app app_graph.apps%rowtype; v_media jsonb; v_order integer := 0; v_slug text;
begin
  select * into v_app from app_graph.apps where id = p_app_id for update;
  if not found or p_user_id is null or not exists (
    select 1 from public.app_jobs j where j.app_id = p_app_id and j.user_id = p_user_id
      and j.status = 'complete' and j.result->>'outcome' = 'new'
  ) then raise exception 'Only your new app submission can be published'; end if;
  -- Retries return the published page; they cannot overwrite a public listing.
  if v_app.is_public then
    if exists (select 1 from public.app_submission_details d where d.app_id = p_app_id and d.submitted_by = p_user_id)
      then return jsonb_build_object('app_id', p_app_id, 'slug', v_app.slug, 'published', true); end if;
    raise exception 'This app is already public; verify ownership to edit it';
  end if;
  if v_app.claim_state <> 'unclaimed' or exists (
    select 1 from public.app_owners o where o.app_id = p_app_id and o.revoked_at is null
  ) then raise exception 'Verify ownership to edit this app'; end if;
  v_slug := p_details->>'slug';
  if jsonb_typeof(p_details) <> 'object' or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or char_length(v_slug) not between 2 and 80
    or char_length(p_details->>'name') not between 2 and 120
    or char_length(p_details->>'description') not between 20 and 2000
    or char_length(p_details->>'tagline') not between 2 and 200
    or jsonb_array_length(p_details->'categories') not between 1 and 3
    or jsonb_array_length(p_details->'platforms') not between 1 and 7
    or jsonb_array_length(p_details->'media') > 8
    then raise exception 'Invalid app details'; end if;
  if exists (select 1 from app_graph.apps where slug = v_slug and id <> p_app_id)
    then raise exception 'That app URL is already taken. Choose another slug.'; end if;
  update app_graph.apps set name = p_details->>'name', tagline = p_details->>'tagline',
    description = p_details->>'description', logo_url = p_details->>'logo_url', slug = v_slug,
    categories = array(select jsonb_array_elements_text(p_details->'categories')),
    platforms = array(select jsonb_array_elements_text(p_details->'platforms')),
    tags = array(select jsonb_array_elements_text(p_details->'tags')),
    is_public = true, updated_at = now() where id = p_app_id;
  insert into public.app_submission_details(app_id, submitted_by, details)
    values (p_app_id, p_user_id, p_details - 'media');
  for v_media in select value from jsonb_array_elements(p_details->'media') loop
    insert into app_graph.app_media(app_id, source_type, source_media_id, media_type, source_url, sort_order)
      values (p_app_id, 'owner', 'submission:' || p_app_id::text || ':' || v_order::text,
        v_media->>'type', v_media->>'url', v_order);
    v_order := v_order + 1;
  end loop;
  insert into app_graph.app_identity_events(app_id, event_type, details)
    values (p_app_id, 'user_app_published', jsonb_build_object('user_id',p_user_id,'submission_type',p_details->>'submission_type','verified',false));
  return jsonb_build_object('app_id', p_app_id, 'slug', v_slug, 'published', true);
end;
$$;
revoke all on function public.publish_new_app_submission(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.publish_new_app_submission(uuid,uuid,jsonb) to service_role;
