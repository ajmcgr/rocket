-- Only the server-side valuation function may store provider-verified evidence.
alter table public.rocket_valuations drop constraint valuation_manual_source;
alter table public.rocket_valuations drop constraint valuation_unverified_result;
alter table public.rocket_valuations drop constraint rocket_valuations_verification_status_check;
alter table public.rocket_valuations add constraint rocket_valuations_verification_status_check
  check (verification_status in ('manual', 'provider_verified'));
alter table public.rocket_valuations add constraint valuation_source_evidence_check check (
  (verification_status = 'manual' and data_sources = array['manual']::text[]
    and (result->'evidence' = '{"stripe":false,"ga4":false}'::jsonb) is true)
  or (verification_status = 'provider_verified' and data_sources in (
    array['stripe']::text[], array['ga4']::text[], array['stripe','ga4']::text[])
    and (result->'evidence'->>'stripe')::boolean = ('stripe' = any(data_sources))
    and (result->'evidence'->>'ga4')::boolean = ('ga4' = any(data_sources)))
);

create function public.guard_rocket_verified_valuation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.verification_status = 'provider_verified' and (select auth.role()) <> 'service_role' then
    raise exception 'Provider-verified valuations require server validation';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_rocket_verified_valuation() from public, anon, authenticated;
create trigger guard_rocket_verified_valuation before insert on public.rocket_valuations
  for each row execute function public.guard_rocket_verified_valuation();
