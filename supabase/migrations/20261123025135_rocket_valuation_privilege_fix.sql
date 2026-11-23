-- Supabase's default table grants include UPDATE. Saved estimates are immutable;
-- users may insert, read and delete their own records only.
revoke all on public.rocket_valuations from authenticated;
grant select, insert, delete on public.rocket_valuations to authenticated;
