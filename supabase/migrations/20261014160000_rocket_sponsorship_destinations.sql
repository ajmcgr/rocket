-- A null destination keeps existing and future ads linked to their Rocket app.
-- Only the trusted advertising checkout service may write a website destination.
alter table public.rocket_sponsorships
  add column if not exists destination_url text;

do $$ begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.rocket_sponsorships'::regclass
      and conname = 'rocket_sponsorship_destination_url_check'
  ) then
    alter table public.rocket_sponsorships
      add constraint rocket_sponsorship_destination_url_check
      check (destination_url is null or (
        length(destination_url) between 9 and 2048
        and destination_url ~ '^https://[^[:space:]]+$'
      ));
  end if;
end $$;
