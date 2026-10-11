-- Production founder outreach remains paused and unauthorized after this migration.
-- Imported Launch ownership is provenance, not permission to market Rocket.
alter table public.rocket_outreach_control
  drop constraint rocket_outreach_control_send_mode_check;
alter table public.rocket_outreach_control
  add constraint rocket_outreach_control_send_mode_check
  check (send_mode in ('test','production'));
alter table public.rocket_outreach_control
  add column production_authorized boolean not null default false,
  add column daily_limit integer not null default 25 check (daily_limit between 1 and 100),
  add column hourly_limit integer not null default 10 check (hourly_limit between 1 and 100);

create table public.rocket_outreach_recipient_reviews (
  email text primary key,
  status text not null default 'requires_review'
    check (status in ('eligible','not_eligible','requires_review')),
  source text not null default 'launch_auth_product_owner',
  directly_provided boolean,
  launch_communications_disclosed boolean,
  rocket_communications_disclosed boolean,
  permission_basis text,
  recipient_country text,
  subscriber_type text check (subscriber_type in ('individual','organization','unknown')),
  evidence_reference text,
  reason text not null,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint rocket_outreach_review_eligible_evidence check (
    status <> 'eligible' or
    (nullif(btrim(permission_basis),'') is not null
      and nullif(btrim(evidence_reference),'') is not null
      and reviewed_by is not null and reviewed_at is not null))
);
alter table public.rocket_outreach_recipient_reviews enable row level security;
revoke all on public.rocket_outreach_recipient_reviews from public, anon, authenticated;
grant all on public.rocket_outreach_recipient_reviews to service_role;
insert into public.rocket_outreach_recipient_reviews(email,status,reason)
select lower(btrim(recipient_email)), 'requires_review',
  'Launch product-owner relationship verified; Rocket outreach permission, collection notice and jurisdiction not evidenced'
from public.rocket_outreach_queue
group by lower(btrim(recipient_email))
on conflict (email) do nothing;

alter table public.rocket_outreach_send_attempts
  add column recipient_email_normalized text,
  add column send_mode text not null default 'test'
    check (send_mode in ('test','production'));
create unique index rocket_outreach_send_attempts_one_per_recipient
  on public.rocket_outreach_send_attempts(recipient_email_normalized)
  where recipient_email_normalized is not null;

-- Existing test send is preserved. The production gate is independent and
-- checks the sender's recipient, eligibility, inventory and limits atomically.
create function public.rocket_outreach_reserve_production_send(p_queue_id uuid, p_claim_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_queue public.rocket_outreach_queue%rowtype;
  v_control public.rocket_outreach_control%rowtype;
  v_attempt public.rocket_outreach_send_attempts%rowtype;
  v_email text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service access only' using errcode='42501';
  end if;
  select * into v_control from public.rocket_outreach_control where id=true for update;
  if not found or v_control.paused or v_control.send_mode <> 'production'
      or not v_control.production_authorized then
    raise exception 'Production outreach is paused or unauthorized' using errcode='42501';
  end if;
  select * into v_queue from public.rocket_outreach_queue where id=p_queue_id for update;
  if not found or v_queue.status <> 'queued' or v_queue.sent_at is not null
      or v_queue.invitation_expires_at <= now()
      or v_queue.invitation_token_hash is distinct from
        encode(extensions.digest(coalesce(p_claim_token,''),'sha256'),'hex') then
    raise exception 'Invitation is not ready' using errcode='42501';
  end if;
  v_email := lower(btrim(v_queue.recipient_email));
  if not exists(select 1 from public.rocket_outreach_recipient_reviews r
      where r.email=v_email and r.status='eligible' and r.reviewed_by is not null
        and r.reviewed_at is not null)
      or exists(select 1 from public.rocket_outreach_suppressions s where s.email=v_email)
      or exists(select 1 from public.rocket_outreach_send_attempts a
          join public.rocket_outreach_queue q on q.id=a.queue_id
          where lower(btrim(q.recipient_email))=v_email)
      or exists(select 1 from public.app_owners o
          where o.app_id=v_queue.app_id and o.revoked_at is null)
      or not exists(select 1 from app_graph.app_sources s
          where s.app_id=v_queue.app_id and s.external_id=v_queue.launch_product_id
            and s.source_type='launch' and s.status='active' and s.match_state='attached') then
    raise exception 'Recipient or app is not eligible' using errcode='42501';
  end if;
  if (select count(*) from public.rocket_outreach_send_attempts
      where send_mode='production' and reserved_at >= now()-interval '24 hours') >= v_control.daily_limit
      or (select count(*) from public.rocket_outreach_send_attempts
      where send_mode='production' and reserved_at >= now()-interval '1 hour') >= v_control.hourly_limit then
    raise exception 'Outreach rate limit reached' using errcode='42501';
  end if;
  insert into public.rocket_outreach_send_attempts(queue_id,recipient_email_normalized,send_mode)
    values(p_queue_id,v_email,'production') returning * into v_attempt;
  return jsonb_build_object('attempt_id',v_attempt.id,
    'idempotency_key',v_attempt.idempotency_key,
    'recipient_email',v_email,'app_id',v_queue.app_id);
end;
$$;
revoke all on function public.rocket_outreach_reserve_production_send(uuid,text)
  from public,anon,authenticated;
grant execute on function public.rocket_outreach_reserve_production_send(uuid,text) to service_role;

-- A read-only, deduplicated preview. No imported recipient qualifies merely
-- because they have a Launch account or a public Rocket listing.
create function public.rocket_admin_outreach_first_batch()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.is_rocket_admin() then
    raise exception 'Admin access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_result from (
    select distinct on (lower(btrim(q.recipient_email)))
      q.id,q.app_id,a.name as app_name,q.recipient_email,q.launch_product_id
    from public.rocket_outreach_queue q
    join app_graph.apps a on a.id=q.app_id and a.is_public=true
    join public.rocket_outreach_recipient_reviews r
      on r.email=lower(btrim(q.recipient_email)) and r.status='eligible'
    where q.status='eligible' and q.sent_at is null
      and not exists(select 1 from public.rocket_outreach_suppressions s where s.email=r.email)
      and not exists(select 1 from public.rocket_outreach_send_attempts t
        join public.rocket_outreach_queue previous on previous.id=t.queue_id
        where lower(btrim(previous.recipient_email))=r.email)
      and not exists(select 1 from public.app_owners o
        where o.app_id=q.app_id and o.revoked_at is null)
      and exists(select 1 from app_graph.app_sources s
        where s.app_id=q.app_id and s.external_id=q.launch_product_id
          and s.source_type='launch' and s.status='active' and s.match_state='attached')
    order by lower(btrim(q.recipient_email)),q.created_at,q.id
    limit 100
  ) x;
  return v_result;
end;
$$;
revoke all on function public.rocket_admin_outreach_first_batch() from public,anon;
grant execute on function public.rocket_admin_outreach_first_batch() to authenticated;
