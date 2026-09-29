-- =============================================================================
-- PowerShield - 0004 SECURITY FIX: lock down public.profiles
-- =============================================================================
-- FINDING (lead backend QA, white-box + live RLS probe):
--   The publishable (anon) key could UPDATE / DELETE / INSERT into
--   public.profiles, because the table was created without any RLS policies
--   and RLS was never enabled. Any visitor with the browser bundle (where the
--   publishable key is public by design) could silently rewrite every user's
--   billing cycle - verified live: anon UPDATE changed billing_cycle_day.
--
-- FIX: enable RLS and grant access ONLY to the authenticated role, scoped to
-- that user's own row once auth lands. Until then the table is effectively
-- read-only over PostgREST; the app writes through the server action, which
-- uses the service-role key on the Vercel runtime.
-- =============================================================================

alter table public.profiles enable row level security;

-- Revoke write grants from anon / authenticated at the SQL level too.
-- (RLS is the primary control; these are defence in depth.)
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;

-- Drop any permissive policy that may have been added previously.
drop policy if exists "profiles_read"  on public.profiles;
drop policy if exists "profiles_write" on public.profiles;
drop policy if exists "profiles_all"  on public.profiles;

-- Reads: everyone may read the singleton settings row.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to anon, authenticated
  using (true);

-- Writes: authenticated users may only write their OWN row.
-- (Uses user_id when the auth schema is wired; the singleton row currently
--  has a zero-uuid id, so authenticated writes are scoped to that uid.)
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid()::text = id::text or id = '00000000-0000-0000-0000-000000000000');

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid()::text = id::text or id = '00000000-0000-0000-0000-000000000000')
  with check (auth.uid()::text = id::text or id = '00000000-0000-0000-0000-000000000000');

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using (auth.uid()::text = id::text);