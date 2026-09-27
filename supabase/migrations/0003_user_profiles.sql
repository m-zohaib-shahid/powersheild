-- =============================================================================
-- PowerShield - 0003 user profiles
-- =============================================================================
-- The billing cycle day lives here so the 30-day window in
-- lib/burn-rate.ts follows the user's own meter reset date.
--
-- NOTE: the live table in Supabase is a SINGLETON settings table:
--   profiles (
--     id                uuid primary key   (always the all-zero uuid)
--     billing_cycle_day smallint not null   (1-31)
--     unit_limit        smallint
--     created_at        timestamptz
--     updated_at        timestamptz
--   )
-- This migration is idempotent and only touches the column the app uses.
-- =============================================================================

-- 1) Ensure the column exists (no-op when the table is already correct).
alter table public.profiles
  add column if not exists billing_cycle_day smallint not null default 5;

-- 2) Enforce the 1-31 domain.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_billing_cycle_day_check'
  ) then
    alter table public.profiles
      add constraint profiles_billing_cycle_day_check
      check (billing_cycle_day between 1 and 31);
  end if;
end
$$;

-- 3) Guarantee the singleton row exists so reads never come back empty.
insert into public.profiles (id, billing_cycle_day)
values ('00000000-0000-0000-0000-000000000000', 5)
on conflict (id) do nothing;