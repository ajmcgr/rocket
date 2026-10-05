-- Transactional ownership-review mail. Credentials stay in a non-exposed schema;
-- emails contain only allowlisted context, never verification challenges/tokens.
create schema if not exists claim_private;
revoke all on schema claim_private from public, anon, authenticated;
-- pg_net's extension defaults grant ordinary roles table access. Dispatch
-- capabilities must not be readable through the transient HTTP request queue.
revoke all on net.http_request_queue,net._http_response from public,anon,authenticated;
grant select on net.http_request_queue,net._http_response to service_role;
alter table public.app_claims add column if not exists evidence text;
alter table public.app_claims add constraint app_claims_evidence_length check (length(evidence) <= 4000);
create table claim_private.email_queue (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.app_claims(id) on delete cascade,
  event_key text not null unique,
  recipient text not null,
  kind text not null check (kind in ('admin_request','received','approved','rejected','correction')),
  context jsonb not null,
  dispatch_token text not null default encode(extensions.gen_random_bytes(32),'hex'),
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  leased_until timestamptz,
  sent_at timestamptz,
  resend_id text,
  last_error text
);
alter table claim_private.email_queue enable row level security;
revoke all on claim_private.email_queue from public,anon,authenticated;
create index claim_email_unsent on claim_private.email_queue(available_at) where sent_at is null;
create index claim_email_claim on claim_private.email_queue(claim_id);

create function claim_private.dispatch_emails() returns void
language plpgsql security definer set search_path='' as $$
declare q record;
begin
  for q in select id,dispatch_token from claim_private.email_queue
    where sent_at is null and attempts < 8 and available_at <= now()
      and (leased_until is null or leased_until < now())
      and created_at > now()-interval '23 hours'
    order by created_at limit 20
  loop
    perform net.http_post(
      url:='https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/send-email',
      headers:='{"Content-Type":"application/json"}'::jsonb,
      body:=jsonb_build_object('action','claim_email','event_id',q.id,'dispatch_token',q.dispatch_token),
      timeout_milliseconds:=10000);
  end loop;
end; $$;
revoke all on function claim_private.dispatch_emails() from public,anon,authenticated;

-- Only the Edge Function's server credential may redeem the unguessable queue
-- capability. Neither a recipient nor email HTML can be supplied by a caller.
create function public.lease_claim_email(p_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q claim_private.email_queue;
begin
  update claim_private.email_queue set attempts=attempts+1,leased_until=now()+interval '5 minutes',
    available_at=now()+interval '5 minutes' * power(2,least(attempts,6))
    where id=p_id and dispatch_token=p_token and sent_at is null and attempts<8
      and available_at<=now() and (leased_until is null or leased_until<now())
      and created_at>now()-interval '23 hours'
    returning * into q;
  if q.id is null then return null; end if;
  return jsonb_build_object('id',q.id,'recipient',q.recipient,'kind',q.kind,'context',q.context);
end; $$;
revoke all on function public.lease_claim_email(uuid,text) from public,anon,authenticated;
grant execute on function public.lease_claim_email(uuid,text) to service_role;

create function public.finish_claim_email(p_id uuid,p_token text,p_resend_id text,p_error text) returns void
language sql security definer set search_path='' as $$
  update claim_private.email_queue set
    sent_at=case when p_resend_id is not null then now() else null end,
    resend_id=p_resend_id,leased_until=null,last_error=left(p_error,100)
    where id=p_id and dispatch_token=p_token and sent_at is null;
$$;
revoke all on function public.finish_claim_email(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_claim_email(uuid,text,text,text) to service_role;

create function claim_private.capture_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare ctx jsonb; requester text; admin_id uuid; admin_email text; event text; kind text;
begin
  if new.status='review' and (TG_OP='INSERT' or old.status is distinct from new.status) then
    event:='received';
  elsif TG_OP='UPDATE' and old.status in ('review','pending') and new.status in ('verified','rejected') then
    event:=case new.status when 'verified' then 'approved' else 'rejected' end;
  elsif TG_OP='UPDATE' and new.status='review' and new.review_reason is distinct from old.review_reason then
    event:='correction';
  else return new;
  end if;
  -- DNS proof is handled separately; only requests needing a human create mail.
  if event <> 'received' and not (new.method in ('manual_review','existing_relationship') or old.status='review') then return new; end if;
  select u.email into requester from auth.users u where u.id=new.user_id and u.deleted_at is null;
  select u.id,u.email into admin_id,admin_email from auth.users u
    where lower(u.email)='alex@alexmacgregor.com' and u.email_confirmed_at is not null and u.deleted_at is null;
  select jsonb_build_object('app_name',a.name,'app_url',a.website_url,'claim_id',new.id,
    'user_id',new.user_id,'requester_email',requester,'requested_at',new.created_at,
    'method',new.method,'status',new.status,'canonical_host',a.canonical_host,
    'evidence_available',coalesce(length(new.evidence)>0,false),
    'owner_conflict',exists(select 1 from public.app_owners o where o.app_id=new.app_id and o.revoked_at is null and o.user_id<>new.user_id),
    'decided_at',case when event='approved' then new.completed_at when event='rejected' then new.rejected_at else null end)
    into ctx from app_graph.apps a where a.id=new.app_id;
  -- Reasons/evidence are visible in the authenticated UI, not copied into mail:
  -- these free-text fields could contain a pasted secret or verification token.
  if requester is not null then
    insert into claim_private.email_queue(claim_id,event_key,recipient,kind,context)
      values(new.id,new.id||':'||event||':'||case when event='received' then 'initial' else clock_timestamp()::text end,requester,event,ctx)
      on conflict(event_key) do nothing;
  end if;
  if event='received' and admin_email is not null then
    insert into claim_private.email_queue(claim_id,event_key,recipient,kind,context)
      values(new.id,new.id||':admin_request',admin_email,'admin_request',ctx) on conflict(event_key) do nothing;
    insert into public.account_notifications(user_id,kind,title,body,href,event_key)
      values(admin_id,'app','Ownership review requested',coalesce(ctx->>'app_name','App')||': a claimant needs manual review.',
        '/admin/ops?claim='||new.id||'#claim-'||new.id,'manual-review:'||new.id)
      on conflict(user_id,event_key) do nothing;
  end if;
  perform claim_private.dispatch_emails();
  return new;
end; $$;
revoke all on function claim_private.capture_review() from public,anon,authenticated;
create trigger queue_claim_review_mail after insert or update on public.app_claims
  for each row execute function claim_private.capture_review();
select cron.schedule('rocket-claim-email-retry','*/5 * * * *','select claim_private.dispatch_emails()');

-- A manual request is idempotent, including concurrent clicks. Terminal claims
-- are never reopened by a repeat request; a new decision requires admin action.
create function public.request_manual_app_review(p_user_id uuid,p_app_id uuid,p_evidence text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.app_claims;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_app_id::text||':'||p_user_id::text,0));
  select * into c from public.app_claims where app_id=p_app_id and user_id=p_user_id and method='manual_review' for update;
  if c.id is null then
    insert into public.app_claims(app_id,user_id,method,status,evidence,review_reason)
      values(p_app_id,p_user_id,'manual_review','review',nullif(trim(left(p_evidence,4000)),''),
        case when exists(select 1 from public.app_owners o where o.app_id=p_app_id and o.revoked_at is null and o.user_id<>p_user_id) then 'Existing owner conflict' else null end)
      returning * into c;
  end if;
  return jsonb_build_object('claim_id',c.id,'status',c.status,'reason',case c.status
    when 'review' then 'Manual review received. You will receive an email when Rocket makes a decision.'
    when 'rejected' then 'This request was not approved. Review the decision in Your Apps.'
    when 'verified' then 'This claim is already approved.' else 'This request already exists. Review it in Your Apps.' end);
end; $$;
revoke all on function public.request_manual_app_review(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.request_manual_app_review(uuid,uuid,text) to service_role;

create function public.rocket_admin_claims(p_claim uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_rocket_admin() then raise exception 'Admin access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(q)) from (
    select c.id,c.app_id,a.name app_name,a.website_url app_url,c.user_id,u.email requester_email,
      p.full_name requester_name,c.method,c.status,c.review_reason,c.evidence,c.created_at,c.completed_at,c.rejected_at,
      exists(select 1 from public.app_owners o where o.app_id=c.app_id and o.revoked_at is null and o.user_id<>c.user_id) owner_conflict,
      (select coalesce(jsonb_agg(jsonb_build_object('action',d.action,'admin_user_id',d.admin_user_id,'created_at',d.created_at,'reason',d.context->>'reason') order by d.created_at desc),'[]')
        from public.rocket_admin_audit d where d.target_type='claim' and d.target_id=c.id::text) decisions,
      (select coalesce(jsonb_agg(jsonb_build_object('kind',e.kind,'sent_at',e.sent_at,'attempts',e.attempts,'last_error',e.last_error)),'[]') from claim_private.email_queue e where e.claim_id=c.id) emails
    from public.app_claims c join app_graph.apps a on a.id=c.app_id
      join auth.users u on u.id=c.user_id left join public.profiles p on p.user_id=c.user_id
    where c.status in ('pending','review') or c.id=p_claim
    order by (c.id=p_claim) desc nulls last,(c.status='review') desc,(c.method='manual_review') desc,c.created_at
    limit 200
  ) q),'[]'::jsonb);
end; $$;
revoke all on function public.rocket_admin_claims(uuid) from public,anon;
grant execute on function public.rocket_admin_claims(uuid) to authenticated;

-- Notify for already-waiting reviews too; never replay historical decisions.
with requests as (
  select c.id,u.email,jsonb_build_object('app_name',a.name,'app_url',a.website_url,
    'claim_id',c.id,'user_id',c.user_id,'requester_email',u.email,'requested_at',c.created_at,
    'method',c.method,'status',c.status,'canonical_host',a.canonical_host,
    'evidence_available',coalesce(length(c.evidence)>0,false),
    'owner_conflict',exists(select 1 from public.app_owners o where o.app_id=c.app_id and o.revoked_at is null and o.user_id<>c.user_id)) context
  from public.app_claims c join app_graph.apps a on a.id=c.app_id join auth.users u on u.id=c.user_id
  where c.status='review' and u.deleted_at is null
), recipients as (
  select id,id||':received:initial' event_key,email recipient,'received' kind,context from requests where email is not null
  union all
  select r.id,r.id||':admin_request',u.email,'admin_request',r.context from requests r cross join auth.users u
    where lower(u.email)='alex@alexmacgregor.com' and u.email_confirmed_at is not null and u.deleted_at is null
)
insert into claim_private.email_queue(claim_id,event_key,recipient,kind,context)
  select id,event_key,recipient,kind,context from recipients on conflict(event_key) do nothing;
insert into public.account_notifications(user_id,kind,title,body,href,event_key)
  select u.id,'app','Ownership review requested',a.name||': a claimant needs manual review.',
    '/admin/ops?claim='||c.id||'#claim-'||c.id,'manual-review:'||c.id
  from public.app_claims c join app_graph.apps a on a.id=c.app_id cross join auth.users u
  where c.status='review' and lower(u.email)='alex@alexmacgregor.com' and u.email_confirmed_at is not null and u.deleted_at is null
  on conflict(user_id,event_key) do nothing;
select claim_private.dispatch_emails();
