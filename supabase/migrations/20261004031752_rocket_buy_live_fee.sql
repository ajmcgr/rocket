-- Forward-only commercial change. Keep historical test plans and every
-- transaction amount/application fee intact. Approval does not enable buying.
alter table public.connect_products
  drop constraint if exists connect_products_platform_fee_bps_check;
alter table public.connect_products
  add constraint connect_products_platform_fee_bps_check
  check (platform_fee_bps in (500, 1000));
alter table public.connect_products alter column platform_fee_bps set default 500;

create or replace function public.connect_enforce_new_plan_fee()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.platform_fee_bps <> 500 then
    raise exception 'New Buy with Rocket plans require a 5%% platform fee';
  end if;
  if tg_op = 'UPDATE' and new.platform_fee_bps <> old.platform_fee_bps then
    raise exception 'Registered plan fees are immutable; register a new plan';
  end if;
  return new;
end;
$$;
revoke all on function public.connect_enforce_new_plan_fee() from public, anon, authenticated;
create trigger connect_new_plan_fee before insert or update on public.connect_products
for each row execute function public.connect_enforce_new_plan_fee();

update public.rocket_buy_configuration
set platform_fee_bps = 500, updated_at = now()
where singleton = true;
