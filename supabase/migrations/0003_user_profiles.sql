-- =============================================================================
-- PowerShield - 0003 user profiles
-- =============================================================================
-- Stores per-account preferences, currently the billing cycle anchor day
-- (`billing_cycle_day`, 1-31) that drives the 30-day window in
-- lib/burn-rate.ts.
--
-- A profile row is created automatically on sign-in (see the trigger at the
-- bottom), so `getBillingCycleDay()` can safely fall back to the default.
-- =============================================================================

create table if not exists public.profiles (
  -- One profile per Supabase auth account
  user_id           uuid        primary key references auth.users (id) on delete cascade,
  -- Day of month (1-31) the billing cycle resets on
  billing_cycle_day smallint    not null default 10
                            check (billing_cycle_day between 1 and 31),
  updated_at        timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Profiles are strictly private: a user may read and write ONLY their own row.
-- This is what makes `getBillingCycleDay()` safe without extra filtering.
-- ============================================================================

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================================
-- Auto-create a profile on sign-up
-- ============================================================================
-- Keeps the app free of a "create profile on first login" code path: the
-- trigger guarantees a row exists with the default billing day.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, billing_cycle_day)
  values (new.id, 10)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();