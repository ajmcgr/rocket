-- Rocket Deals V1: preparation only. There is deliberately no payment or funded state.
create table public.rocket_deals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.rocket_conversations(id),
  app_id uuid not null references app_graph.apps(id),
  buyer_id uuid not null references auth.users(id),
  seller_id uuid not null references auth.users(id),
  status text not null default 'offer_pending' check (status in
    ('offer_pending','negotiating','offer_accepted','preparing_terms','awaiting_approvals','terms_agreed','awaiting_escrow','cancelled','expired')),
  offer_expires_at timestamptz not null default (now()+interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_id <> seller_id)
);
create index rocket_deals_buyer_idx on public.rocket_deals(buyer_id,updated_at desc);
create index rocket_deals_seller_idx on public.rocket_deals(seller_id,updated_at desc);
create table public.rocket_deal_offers (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  deal_id uuid not null references public.rocket_deals(id),
  actor_id uuid not null references auth.users(id),
  request_id uuid not null,
  amount_cents bigint not null check (amount_cents between 100 and 100000000000),
  currency text not null check (currency in ('USD','EUR','GBP','AUD','CAD')),
  message text not null default '' check (length(message) <= 2000),
  conditions text not null default '' check (length(conditions) <= 2000),
  handover_timeframe text not null default '' check (length(handover_timeframe) <= 200),
  created_at timestamptz not null default now(),
  unique (actor_id,request_id)
);
create index rocket_deal_offers_history on public.rocket_deal_offers(deal_id,sequence desc);
create table public.rocket_deal_events (
  id bigint generated always as identity primary key,
  deal_id uuid not null references public.rocket_deals(id),
  actor_id uuid not null references auth.users(id),
  event text not null check (event in ('offer_submitted','countered','accepted','rejected','withdrawn','expired','terms_saved','terms_approved','checklist_saved','checklist_approved','escrow_ready','agreement_uploaded')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.rocket_deal_agreements (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.rocket_deals(id),
  version integer not null check (version > 0),
  editor_id uuid not null references auth.users(id),
  terms jsonb not null,
  created_at timestamptz not null default now(),
  unique(deal_id,version)
);
create table public.rocket_deal_checklists (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.rocket_deals(id),
  version integer not null check (version > 0),
  editor_id uuid not null references auth.users(id),
  items jsonb not null,
  created_at timestamptz not null default now(),
  unique(deal_id,version)
);
create table public.rocket_deal_approvals (
  deal_id uuid not null references public.rocket_deals(id),
  kind text not null check (kind in ('agreement','checklist')),
  version integer not null,
  user_id uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  primary key(deal_id,kind,version,user_id)
);
create table public.rocket_deal_attachments (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.rocket_deals(id),
  uploader_id uuid not null references auth.users(id),
  object_path text not null unique,
  created_at timestamptz not null default now()
);

-- Browser clients can read their own deal records only; all writes use narrow RPCs.
do $$ declare t text; begin
  foreach t in array array['rocket_deals','rocket_deal_offers','rocket_deal_events','rocket_deal_agreements','rocket_deal_checklists','rocket_deal_approvals','rocket_deal_attachments'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
create policy rocket_deals_parties on public.rocket_deals for select to authenticated
  using ((select auth.uid()) in (buyer_id,seller_id));
create policy rocket_deal_offers_parties on public.rocket_deal_offers for select to authenticated
  using (exists(select 1 from public.rocket_deals d where d.id=deal_id and (select auth.uid()) in (d.buyer_id,d.seller_id)));
create policy rocket_deal_events_parties on public.rocket_deal_events for select to authenticated
  using (exists(select 1 from public.rocket_deals d where d.id=deal_id and (select auth.uid()) in (d.buyer_id,d.seller_id)));
create policy rocket_deal_agreements_parties on public.rocket_deal_agreements for select to authenticated
  using (exists(select 1 from public.rocket_deals d where d.id=deal_id and (select auth.uid()) in (d.buyer_id,d.seller_id)));
create policy rocket_deal_checklists_parties on public.rocket_deal_checklists for select to authenticated
  using (exists(select 1 from public.rocket_deals d where d.id=deal_id and (select auth.uid()) in (d.buyer_id,d.seller_id)));
create policy rocket_deal_approvals_parties on public.rocket_deal_approvals for select to authenticated
  using (exists(select 1 from public.rocket_deals d where d.id=deal_id and (select auth.uid()) in (d.buyer_id,d.seller_id)));
create policy rocket_deal_attachments_parties on public.rocket_deal_attachments for select to authenticated
  using (exists(select 1 from public.rocket_deals d where d.id=deal_id and (select auth.uid()) in (d.buyer_id,d.seller_id)));

create schema if not exists deals_private;
revoke all on schema deals_private from public,anon,authenticated;
create function deals_private.has_secret(p_text text) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(p_text ~* '(sk_(live|test)_[a-z0-9]{8}|github_pat_[a-z0-9_]{12}|ghp_[a-z0-9]{12}|password[[:space:]]*[:=]|api[ _-]?key[[:space:]]*[:=])',false);
$$;
revoke all on function deals_private.has_secret(text) from public,anon,authenticated;
create function deals_private.reject_deal_message_secrets() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.rocket_deals d where d.conversation_id=new.conversation_id)
    and deals_private.has_secret(new.body) then
    raise exception 'Do not share passwords or API keys in deal messages' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function deals_private.reject_deal_message_secrets() from public,anon,authenticated;
create trigger rocket_deal_message_secret_guard before insert on public.rocket_messages
  for each row execute function deals_private.reject_deal_message_secrets();
create function deals_private.notice(p_deal public.rocket_deals,p_actor uuid,p_label text)
returns void language plpgsql security definer set search_path='' as $$
begin
  -- This inserts into the existing private Inbox. Its existing triggers provide
  -- recipient email (respecting preferences) and account bell notifications.
  perform public.send_rocket_message(p_deal.conversation_id,
    'Rocket Deals: ' || p_label || '. Open /deals/' || p_deal.id::text || ' to review.',
    gen_random_uuid());
end $$;
revoke all on function deals_private.notice(public.rocket_deals,uuid,text) from public,anon,authenticated;

create function public.rocket_deal_make_offer(
  p_app_id uuid,p_amount_cents bigint,p_currency text,p_message text,
  p_conditions text,p_timeframe text,p_request_id uuid,p_no_funds_confirmed boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_conv uuid; v_deal public.rocket_deals; v_offer uuid;
begin
  if v_user is null or p_request_id is null or p_no_funds_confirmed is distinct from true
    or p_amount_cents not between 100 and 100000000000 or p_currency not in ('USD','EUR','GBP','AUD','CAD')
    or length(coalesce(p_message,''))>2000 or length(coalesce(p_conditions,''))>2000
    or length(coalesce(p_timeframe,''))>200
    or deals_private.has_secret(coalesce(p_message,'') || coalesce(p_conditions,'') || coalesce(p_timeframe,'')) then
    raise exception 'Invalid offer or funds acknowledgement missing' using errcode='22023';
  end if;
  if exists(select 1 from public.app_owners o where o.app_id=p_app_id and o.user_id=v_user and o.revoked_at is null) then
    raise exception 'Owners cannot make offers on their own apps' using errcode='42501'; end if;
  select o.deal_id into v_conv from public.rocket_deal_offers o
    where o.actor_id=v_user and o.request_id=p_request_id;
  if v_conv is not null then return v_conv; end if;
  v_conv := public.start_rocket_acquisition_conversation(p_app_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_conv::text,6));
  select * into v_deal from public.rocket_deals where conversation_id=v_conv for update;
  if v_deal.id is null then
    insert into public.rocket_deals(conversation_id,app_id,buyer_id,seller_id)
      select c.id,c.app_id,c.buyer_id,c.seller_id from public.rocket_conversations c where c.id=v_conv
      returning * into v_deal;
  elsif v_deal.status not in ('offer_pending','negotiating') or
    exists(select 1 from public.rocket_deal_offers where deal_id=v_deal.id) then
    raise exception 'A deal already exists for this buyer and app' using errcode='23505';
  end if;
  if (select count(*) from public.rocket_deal_offers o where o.actor_id=v_user
    and o.created_at>now()-interval '1 day')>=20 then
    raise exception 'Daily offer limit reached' using errcode='42901';
  end if;
  insert into public.rocket_deal_offers(deal_id,actor_id,request_id,amount_cents,currency,message,conditions,handover_timeframe)
    values(v_deal.id,v_user,p_request_id,p_amount_cents,p_currency,coalesce(p_message,''),coalesce(p_conditions,''),coalesce(p_timeframe,''))
    returning id into v_offer;
  insert into public.rocket_deal_events(deal_id,actor_id,event,detail)
    values(v_deal.id,v_user,'offer_submitted',jsonb_build_object('offer_id',v_offer));
  perform deals_private.notice(v_deal,v_user,'A new offer was submitted');
  return v_deal.id;
end $$;
revoke all on function public.rocket_deal_make_offer(uuid,bigint,text,text,text,text,uuid,boolean) from public,anon;
grant execute on function public.rocket_deal_make_offer(uuid,bigint,text,text,text,text,uuid,boolean) to authenticated;

create function public.rocket_deal_respond(
  p_deal_id uuid,p_action text,p_request_id uuid,p_amount_cents bigint default null,
  p_message text default '',p_conditions text default '',p_timeframe text default ''
) returns text language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_deal public.rocket_deals; v_last public.rocket_deal_offers; v_event text; v_status text;
begin
  if v_user is null or p_request_id is null or p_action not in ('accept','reject','counter','withdraw') then
    raise exception 'Invalid response' using errcode='22023'; end if;
  select * into v_deal from public.rocket_deals where id=p_deal_id for update;
  if v_deal.id is null or v_user not in (v_deal.buyer_id,v_deal.seller_id) then
    raise exception 'Deal access denied' using errcode='42501'; end if;
  if not public.rocket_listing_is_public(v_deal.app_id,v_deal.seller_id) then
    raise exception 'Seller ownership is no longer verified' using errcode='42501'; end if;
  if exists(select 1 from public.rocket_deal_events e where e.deal_id=p_deal_id
      and e.detail->>'request_id'=p_request_id::text) then return v_deal.status; end if;
  if v_deal.status not in ('offer_pending','negotiating') then
    raise exception 'Offer is no longer open' using errcode='22023'; end if;
  if now()>v_deal.offer_expires_at then
    update public.rocket_deals set status='expired',updated_at=now() where id=p_deal_id;
    insert into public.rocket_deal_events(deal_id,actor_id,event) values(p_deal_id,v_user,'expired');
    perform deals_private.notice(v_deal,v_user,'The outstanding offer expired');
    return 'expired';
  end if;
  select * into v_last from public.rocket_deal_offers where deal_id=p_deal_id order by sequence desc limit 1;
  if v_last.id is null then raise exception 'Offer missing' using errcode='P0002'; end if;
  if p_action='withdraw' then
    if v_user<>v_last.actor_id or v_user<>v_deal.buyer_id then raise exception 'Only buyer may withdraw own offer' using errcode='42501'; end if;
    v_event:='withdrawn'; v_status:='cancelled';
  elsif v_user=v_last.actor_id then
    raise exception 'Only the receiving party may respond' using errcode='42501';
  elsif p_action='counter' then
    if p_amount_cents not between 100 and 100000000000 or length(coalesce(p_message,''))>2000
      or length(coalesce(p_conditions,''))>2000 or length(coalesce(p_timeframe,''))>200
      or deals_private.has_secret(coalesce(p_message,'') || coalesce(p_conditions,'') || coalesce(p_timeframe,'')) then
      raise exception 'Invalid counteroffer' using errcode='22023'; end if;
    insert into public.rocket_deal_offers(deal_id,actor_id,request_id,amount_cents,currency,message,conditions,handover_timeframe)
      values(p_deal_id,v_user,p_request_id,p_amount_cents,v_last.currency,coalesce(p_message,''),coalesce(p_conditions,''),coalesce(p_timeframe,''));
    v_event:='countered'; v_status:='negotiating';
  elsif p_action='accept' then v_event:='accepted'; v_status:='offer_accepted';
  else v_event:='rejected'; v_status:='cancelled'; end if;
  update public.rocket_deals set status=v_status,updated_at=now(),
    offer_expires_at=case when v_event='countered' then now()+interval '30 days' else offer_expires_at end
    where id=p_deal_id;
  insert into public.rocket_deal_events(deal_id,actor_id,event,detail)
    values(p_deal_id,v_user,v_event,jsonb_build_object('request_id',p_request_id,'offer_id',v_last.id));
  perform deals_private.notice(v_deal,v_user,case v_event when 'countered' then 'A counteroffer needs your review'
    when 'accepted' then 'The offer was accepted; prepare transaction terms'
    when 'rejected' then 'The offer was rejected' else 'The offer was withdrawn' end);
  return v_status;
end $$;
revoke all on function public.rocket_deal_respond(uuid,text,uuid,bigint,text,text,text) from public,anon;
grant execute on function public.rocket_deal_respond(uuid,text,uuid,bigint,text,text,text) to authenticated;

create function public.rocket_deal_save_document(p_deal_id uuid,p_kind text,p_data jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_deal public.rocket_deals; v_version integer; v_value jsonb;
begin
  select * into v_deal from public.rocket_deals where id=p_deal_id for update;
  if v_deal.id is null or v_user not in (v_deal.buyer_id,v_deal.seller_id)
    or v_deal.status not in ('offer_accepted','preparing_terms','awaiting_approvals','terms_agreed','awaiting_escrow')
    or p_kind not in ('agreement','checklist') or p_data is null
    or octet_length(p_data::text)>30000 then
    raise exception 'Document access or size invalid' using errcode='42501'; end if;
  if not public.rocket_listing_is_public(v_deal.app_id,v_deal.seller_id) then
    raise exception 'Seller ownership is no longer verified' using errcode='42501'; end if;
  if p_kind='checklist' and v_user<>v_deal.seller_id then
    raise exception 'Only seller may select handover assets' using errcode='42501'; end if;
  if p_kind='agreement' then
    if jsonb_typeof(p_data)<>'object' or not p_data ?& array[
      'assets_included','assets_excluded','seller_responsibilities','buyer_responsibilities',
      'handover_deadline','inspection_period','conditions','escrow_fee_responsibility','cancellation_conditions']
      or (select count(*) from jsonb_object_keys(p_data))<>9 then
      raise exception 'Agreement fields missing' using errcode='22023'; end if;
    if deals_private.has_secret(p_data::text) then raise exception 'Do not store secrets in deal terms' using errcode='22023'; end if;
    for v_value in select value from jsonb_each(p_data) loop
      if jsonb_typeof(v_value)<>'string' or length(btrim(v_value#>>'{}')) not between 1 and 3000 then
        raise exception 'Invalid agreement field' using errcode='22023'; end if;
    end loop;
    select coalesce(max(version),0)+1 into v_version from public.rocket_deal_agreements where deal_id=p_deal_id;
    insert into public.rocket_deal_agreements(deal_id,version,editor_id,terms) values(p_deal_id,v_version,v_user,p_data);
  else
    if jsonb_typeof(p_data)<>'array' or jsonb_array_length(p_data) not between 1 and 60 then
      raise exception 'Checklist must contain 1 to 60 items' using errcode='22023'; end if;
    if deals_private.has_secret(p_data::text) then raise exception 'Do not store secrets in checklist' using errcode='22023'; end if;
    for v_value in select value from jsonb_array_elements(p_data) loop
      if jsonb_typeof(v_value)<>'object' or not v_value ?& array['name','description','responsible_party','required','delivery_method','acceptance_criteria','notes']
        or (select count(*) from jsonb_object_keys(v_value))<>7
        or length(coalesce(v_value->>'name','')) not between 1 and 150
        or (v_value->>'responsible_party') not in ('buyer','seller')
        or jsonb_typeof(v_value->'required')<>'boolean'
        or length(coalesce(v_value->>'description',''))>1000
        or length(coalesce(v_value->>'acceptance_criteria',''))>1000
        or length(coalesce(v_value->>'notes',''))>1000
        or (v_value->>'delivery_method') not in ('ownership_transfer','project_migration','account_recreation','provider_approval','other','document','not_applicable') then
        raise exception 'Invalid checklist item' using errcode='22023'; end if;
    end loop;
    select coalesce(max(version),0)+1 into v_version from public.rocket_deal_checklists where deal_id=p_deal_id;
    insert into public.rocket_deal_checklists(deal_id,version,editor_id,items) values(p_deal_id,v_version,v_user,p_data);
  end if;
  update public.rocket_deals set status=case when
    exists(select 1 from public.rocket_deal_agreements where deal_id=p_deal_id) and
    exists(select 1 from public.rocket_deal_checklists where deal_id=p_deal_id)
    then 'awaiting_approvals' else 'preparing_terms' end,updated_at=now() where id=p_deal_id;
  insert into public.rocket_deal_events(deal_id,actor_id,event,detail)
    values(p_deal_id,v_user,case when p_kind='agreement' then 'terms_saved' else 'checklist_saved' end,
      jsonb_build_object('version',v_version));
  perform deals_private.notice(v_deal,v_user,case when p_kind='agreement' then 'Transaction terms need your approval' else 'The handover checklist needs your approval' end);
  return v_version;
end $$;
revoke all on function public.rocket_deal_save_document(uuid,text,jsonb) from public,anon;
grant execute on function public.rocket_deal_save_document(uuid,text,jsonb) to authenticated;

create function public.rocket_deal_approve_document(p_deal_id uuid,p_kind text,p_version integer)
returns text language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_deal public.rocket_deals; v_latest integer; v_terms integer; v_checklist integer; v_status text; v_new_approval boolean := false;
begin
  select * into v_deal from public.rocket_deals where id=p_deal_id for update;
  if v_deal.id is null or v_user not in (v_deal.buyer_id,v_deal.seller_id)
    or v_deal.status not in ('awaiting_approvals','terms_agreed') or p_kind not in ('agreement','checklist') then
    raise exception 'Approval not permitted' using errcode='42501'; end if;
  if not public.rocket_listing_is_public(v_deal.app_id,v_deal.seller_id) then
    raise exception 'Seller ownership is no longer verified' using errcode='42501'; end if;
  if p_kind='agreement' then
    select max(version) into v_latest from public.rocket_deal_agreements where deal_id=p_deal_id;
  else select max(version) into v_latest from public.rocket_deal_checklists where deal_id=p_deal_id; end if;
  if p_version is distinct from v_latest or v_latest is null then
    raise exception 'Only latest version may be approved' using errcode='22023'; end if;
  insert into public.rocket_deal_approvals(deal_id,kind,version,user_id)
    values(p_deal_id,p_kind,p_version,v_user) on conflict do nothing;
  if found then
    v_new_approval := true;
    insert into public.rocket_deal_events(deal_id,actor_id,event,detail)
      values(p_deal_id,v_user,case when p_kind='agreement' then 'terms_approved' else 'checklist_approved' end,
        jsonb_build_object('version',p_version));
  end if;
  select max(version) into v_terms from public.rocket_deal_agreements where deal_id=p_deal_id;
  select max(version) into v_checklist from public.rocket_deal_checklists where deal_id=p_deal_id;
  if v_terms is not null and (select count(*) from public.rocket_deal_approvals
    where deal_id=p_deal_id and kind='agreement' and version=v_terms)=2 then
    v_status:='terms_agreed';
    update public.rocket_deals set status=v_status,updated_at=now() where id=p_deal_id;
  else v_status:=v_deal.status; end if;
  if v_new_approval then
    perform deals_private.notice(v_deal,v_user,case when v_status='terms_agreed' and v_deal.status<>'terms_agreed'
      then 'Both parties approved the transaction terms'
      when p_kind='agreement' then 'Agreement approval recorded'
      else 'Checklist approval recorded' end);
  end if;
  return v_status;
end $$;
revoke all on function public.rocket_deal_approve_document(uuid,text,integer) from public,anon;
grant execute on function public.rocket_deal_approve_document(uuid,text,integer) to authenticated;

create function public.rocket_deal_prepare_escrow(p_deal_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_deal public.rocket_deals; v_terms integer; v_checklist integer;
begin
  select * into v_deal from public.rocket_deals where id=p_deal_id for update;
  if v_deal.id is null or v_user not in (v_deal.buyer_id,v_deal.seller_id) or v_deal.status<>'terms_agreed' then
    raise exception 'Deal not ready for escrow preparation' using errcode='42501'; end if;
  if not public.rocket_listing_is_public(v_deal.app_id,v_deal.seller_id) then
    raise exception 'Seller ownership is no longer verified' using errcode='42501'; end if;
  select max(version) into v_terms from public.rocket_deal_agreements where deal_id=p_deal_id;
  select max(version) into v_checklist from public.rocket_deal_checklists where deal_id=p_deal_id;
  if v_terms is null or v_checklist is null or
    (select count(*) from public.rocket_deal_approvals where deal_id=p_deal_id and kind='agreement' and version=v_terms)<>2 or
    (select count(*) from public.rocket_deal_approvals where deal_id=p_deal_id and kind='checklist' and version=v_checklist)<>2 then
    raise exception 'Both parties must approve current terms and checklist' using errcode='22023'; end if;
  update public.rocket_deals set status='awaiting_escrow',updated_at=now() where id=p_deal_id;
  insert into public.rocket_deal_events(deal_id,actor_id,event) values(p_deal_id,v_user,'escrow_ready');
  perform deals_private.notice(v_deal,v_user,'Escrow setup is now required; no funds have been collected');
end $$;
revoke all on function public.rocket_deal_prepare_escrow(uuid) from public,anon;
grant execute on function public.rocket_deal_prepare_escrow(uuid) to authenticated;

-- Signed documents remain private; no direct storage path is published.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('rocket-deal-agreements','rocket-deal-agreements',false,10485760,array['application/pdf'])
  on conflict(id) do nothing;
create policy rocket_deal_agreement_read on storage.objects for select to authenticated
  using (bucket_id='rocket-deal-agreements' and exists(
    select 1 from public.rocket_deals d where d.id::text=(storage.foldername(name))[1]
      and (select auth.uid()) in (d.buyer_id,d.seller_id)));
create policy rocket_deal_agreement_upload on storage.objects for insert to authenticated
  with check (bucket_id='rocket-deal-agreements' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
    and exists(select 1 from public.rocket_deals d where d.id::text=(storage.foldername(name))[1]
      and (select auth.uid()) in (d.buyer_id,d.seller_id)
      and d.status in ('preparing_terms','awaiting_approvals','terms_agreed','awaiting_escrow')));
create function public.rocket_deal_register_agreement(p_deal_id uuid,p_path text)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid());
begin
  if not exists(select 1 from public.rocket_deals where id=p_deal_id and v_user in (buyer_id,seller_id))
    or p_path !~ ('^' || p_deal_id::text || '/[0-9a-f-]{36}\.pdf$')
    or not exists(select 1 from storage.objects where bucket_id='rocket-deal-agreements' and name=p_path and owner_id=v_user::text) then
    raise exception 'Agreement upload not authorised' using errcode='42501'; end if;
  insert into public.rocket_deal_attachments(deal_id,uploader_id,object_path) values(p_deal_id,v_user,p_path)
    on conflict(object_path) do nothing;
  insert into public.rocket_deal_events(deal_id,actor_id,event) values(p_deal_id,v_user,'agreement_uploaded');
end $$;
revoke all on function public.rocket_deal_register_agreement(uuid,text) from public,anon;
grant execute on function public.rocket_deal_register_agreement(uuid,text) to authenticated;
