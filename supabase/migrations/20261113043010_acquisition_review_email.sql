-- Transactional admin review mail for acquisition listings. The outbox is
-- private and contains only allowlisted listing facts, never seller free text.
create schema if not exists acquisition_private;
revoke all on schema acquisition_private from public,anon,authenticated;

create table acquisition_private.review_email_queue (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  event_key text not null unique,
  recipient text not null,
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
alter table acquisition_private.review_email_queue enable row level security;
revoke all on acquisition_private.review_email_queue from public,anon,authenticated;
create index acquisition_review_email_ready on acquisition_private.review_email_queue(available_at)
  where sent_at is null;

create function acquisition_private.dispatch_review_emails() returns void
language plpgsql security definer set search_path = '' as $$
declare q record;
begin
  for q in select id,dispatch_token from acquisition_private.review_email_queue
    where sent_at is null and attempts < 8 and available_at <= now()
      and (leased_until is null or leased_until < now())
      and created_at > now() - interval '23 hours'
    order by created_at limit 20
  loop
    perform net.http_post(
      url:='https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/send-email',
      headers:='{"Content-Type":"application/json"}'::jsonb,
      body:=jsonb_build_object('action','acquisition_review_email','event_id',q.id,'dispatch_token',q.dispatch_token),
      timeout_milliseconds:=10000);
  end loop;
end $$;
revoke all on function acquisition_private.dispatch_review_emails() from public,anon,authenticated;

create function public.lease_acquisition_review_email(p_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q acquisition_private.review_email_queue;
begin
  update acquisition_private.review_email_queue set attempts=attempts+1,
    leased_until=now()+interval '5 minutes',
    available_at=now()+interval '5 minutes' * power(2,least(attempts,6))
  where id=p_id and dispatch_token=p_token and sent_at is null and attempts<8
    and available_at<=now() and (leased_until is null or leased_until<now())
    and created_at>now()-interval '23 hours'
  returning * into q;
  if q.id is null then return null; end if;
  if not exists(select 1 from public.rocket_acquisition_listings l
      where l.app_id=q.app_id and l.review_status='pending' and l.status<>'not_for_sale') then
    update acquisition_private.review_email_queue set sent_at=now(),leased_until=null,last_error='review no longer pending'
      where id=q.id;
    return null;
  end if;
  return jsonb_build_object('id',q.id,'recipient',q.recipient,'context',q.context);
end $$;
revoke all on function public.lease_acquisition_review_email(uuid,text) from public,anon,authenticated;
grant execute on function public.lease_acquisition_review_email(uuid,text) to service_role;

create function public.finish_acquisition_review_email(p_id uuid,p_token text,p_resend_id text,p_error text) returns void
language sql security definer set search_path = '' as $$
  update acquisition_private.review_email_queue set
    sent_at=case when p_resend_id is not null then now() else null end,
    resend_id=p_resend_id,leased_until=null,last_error=left(p_error,100)
  where id=p_id and dispatch_token=p_token and sent_at is null;
$$;
revoke all on function public.finish_acquisition_review_email(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_acquisition_review_email(uuid,text,text,text) to service_role;

create function acquisition_private.capture_review_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare admin_id uuid; admin_email text; seller_email text; app_name text; app_url text; event_id text; ctx jsonb;
begin
  if new.review_status<>'pending' or new.status='not_for_sale' then return new; end if;
  if TG_OP='UPDATE' and old.review_status='pending' and old.status<>'not_for_sale' then return new; end if;
  select u.id,u.email into admin_id,admin_email from auth.users u
    where lower(u.email)='alex@alexmacgregor.com' and u.email_confirmed_at is not null and u.deleted_at is null;
  if admin_id is null then return new; end if;
  select a.name,a.website_url into app_name,app_url from app_graph.apps a where a.id=new.app_id;
  select u.email into seller_email from auth.users u where u.id=new.seller_user_id and u.deleted_at is null;
  event_id:=new.app_id::text||':pending:'||new.updated_at::text;
  ctx:=jsonb_build_object('app_name',app_name,'app_url',app_url,'status',new.status,
    'asking_price_cents',new.asking_price_cents,'seller_email',seller_email,'requested_at',new.updated_at);
  insert into acquisition_private.review_email_queue(app_id,event_key,recipient,context)
    values(new.app_id,event_id,admin_email,ctx) on conflict(event_key) do nothing;
  insert into public.account_notifications(user_id,kind,title,body,href,event_key)
    values(admin_id,'app','Acquisition listing review requested',
      left(coalesce(app_name,'App'),160)||': a seller submitted an acquisition listing.',
      '/admin/ops','acquisition-review:'||event_id)
    on conflict(user_id,event_key) do nothing;
  perform acquisition_private.dispatch_review_emails();
  return new;
end $$;
revoke all on function acquisition_private.capture_review_request() from public,anon,authenticated;
create trigger queue_acquisition_review_email after insert or update on public.rocket_acquisition_listings
  for each row execute function acquisition_private.capture_review_request();
select cron.schedule('rocket-acquisition-review-email-retry','*/5 * * * *','select acquisition_private.dispatch_review_emails()');

-- Include listings already pending when the notification pipeline goes live.
with pending as (
  select l.app_id,l.updated_at,l.status,l.asking_price_cents,a.name app_name,a.website_url app_url,
    seller.email seller_email,admin.id admin_id,admin.email admin_email
  from public.rocket_acquisition_listings l join app_graph.apps a on a.id=l.app_id
    join auth.users seller on seller.id=l.seller_user_id
    cross join auth.users admin
  where l.review_status='pending' and l.status<>'not_for_sale'
    and lower(admin.email)='alex@alexmacgregor.com' and admin.email_confirmed_at is not null and admin.deleted_at is null
), queued as (
  insert into acquisition_private.review_email_queue(app_id,event_key,recipient,context)
  select app_id,app_id::text||':pending:'||updated_at::text,admin_email,
    jsonb_build_object('app_name',app_name,'app_url',app_url,'status',status,
      'asking_price_cents',asking_price_cents,'seller_email',seller_email,'requested_at',updated_at)
  from pending on conflict(event_key) do nothing returning app_id,event_key
)
insert into public.account_notifications(user_id,kind,title,body,href,event_key)
  select p.admin_id,'app','Acquisition listing review requested',
    left(coalesce(p.app_name,'App'),160)||': a seller submitted an acquisition listing.',
    '/admin/ops','acquisition-review:'||q.event_key
  from pending p join queued q on q.app_id=p.app_id
  on conflict(user_id,event_key) do nothing;
select acquisition_private.dispatch_review_emails();
