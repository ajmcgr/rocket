-- Multiple independently verified offers may belong to one Rocket app.
-- Existing products, purchases and entitlements are left untouched.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop index if exists public.connect_products_one_active_client_idx;
create index if not exists connect_products_active_account_idx
  on public.connect_products (client_id, developer_account_id, product_key)
  where is_active = true;

-- Inline Stripe Checkout prices are created by Stripe for a single session.
-- The registered Rocket offer remains the authoritative, stable price snapshot.
alter table public.connect_products
  alter column stripe_product_id drop not null,
  alter column stripe_price_id drop not null,
  add column if not exists price_source text not null default 'stripe_price';
alter table public.connect_products
  add constraint connect_products_price_source_check
  check (price_source in ('stripe_price', 'inline') and
    ((price_source = 'stripe_price' and stripe_product_id is not null and stripe_price_id is not null) or
     (price_source = 'inline' and billing_type = 'one_time' and interval is null and
      stripe_product_id is null and stripe_price_id is null)));

-- The offer row is the durable amount/merchant/fee snapshot referenced by
-- every checkout attempt and transaction. Retire an offer and register a new
-- product_key for any commercial change; never edit a paid offer in place.
create or replace function public.connect_prevent_offer_terms_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.client_id, new.developer_account_id, new.developer_user_id,
      new.product_key, new.name, new.amount_cents, new.currency,
      new.billing_type, new."interval", new.platform_fee_bps,
      new.stripe_product_id, new.stripe_price_id, new.price_source,
      new.checkout_return_uris)
     is distinct from
     (old.client_id, old.developer_account_id, old.developer_user_id,
      old.product_key, old.name, old.amount_cents, old.currency,
      old.billing_type, old."interval", old.platform_fee_bps,
      old.stripe_product_id, old.stripe_price_id, old.price_source,
      old.checkout_return_uris) then
    raise exception 'registered offer terms are immutable';
  end if;
  return new;
end;
$$;
create trigger connect_products_immutable_terms
  before update on public.connect_products
  for each row execute function public.connect_prevent_offer_terms_change();

commit;
