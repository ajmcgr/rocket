-- Private Launch founder provenance for Rocket Outreach. Sending remains
-- hard-disabled by rocket_outreach_control.send_mode = 'test'.
alter table public.rocket_outreach_queue
  add column founder_first_name text,
  add column launch_relationship text not null default 'product_owner'
    check (launch_relationship = 'product_owner'),
  add column source_imported_at timestamptz not null default now();

create index rocket_outreach_queue_founder_idx
  on public.rocket_outreach_queue(founder_user_id);

comment on table public.rocket_outreach_queue is
  'Private, service-role-only Launch founder outreach queue. Never expose in public app projections.';
comment on column public.rocket_outreach_queue.founder_user_id is
  'Launch auth.users.id for the launched product owner; provenance only, not a Rocket user ID.';
comment on column public.rocket_outreach_queue.launch_product_id is
  'Launch products.id, corroborated by an active attached Rocket app source.';

-- Retain the explicit deny-by-default grants and RLS after schema extension.
alter table public.rocket_outreach_queue enable row level security;
revoke all on public.rocket_outreach_queue from public, anon, authenticated;
grant all on public.rocket_outreach_queue to service_role;
