-- =============================================================================
-- PowerShield — 0002 user-scoped meter logs
-- =============================================================================
-- Adds optional `user_id` isolation to `public.meter_logs`:
--   * signed-in users write rows tagged with their auth uid
--   * anonymous visitors write shared demo rows (user_id = null)
--   * every read is scoped to the caller (own rows + shared demo rows)
--
-- Safe to run on a fresh project (creates the table) or an existing one
-- (alters it in place).
-- =============================================================================

create table if not exists public.meter_logs (
  id            uuid           primary key default gen_random_uuid(),
  reading_value numeric(12, 2) not null check (reading_value >= 0),
  reading_date  date           not null,
  user_id       uuid           references auth.users (id) on delete cascade,
  created_at    timestamptz    not null default now()
);

-- --- Backfill the column when upgrading an already-created table -----------
alter table public.meter_logs add column if not exists user_id uuid
  references auth.users (id) on delete cascade;

-- --- Indexes ---------------------------------------------------------------
-- Cycle/date lookups (shared across all rows).
create index if not exists meter_logs_reading_date_idx
  on public.meter_logs (reading_date desc, created_at desc);

-- Owner-scoped lookups: matches the `user_id.eq.…,user_id.is.null` filter
-- used by every read query in app/actions/meter.ts.
create index if not exists meter_logs_user_date_idx
  on public.meter_logs (user_id, reading_date desc, created_at desc);

-- ============================================================================
-- Row Level Security — owner isolation
-- ============================================================================
-- Reads: your own rows + shared demo rows (user_id is null).
-- Writes: you may only ever write rows tagged with your own uid, or shared
--         rows while signed out.
-- ============================================================================

alter table public.meter_logs enable row level security;

-- SELECT
drop policy if exists "meter_logs_select" on public.meter_logs;
create policy "meter_logs_select"
  on public.meter_logs for select
  to anon, authenticated
  using (user_id is null or auth.uid() = user_id);

-- INSERT — authenticated users must own the row they create.
drop policy if exists "meter_logs_insert" on public.meter_logs;
create policy "meter_logs_insert"
  on public.meter_logs for insert
  to authenticated
  with check (user_id is null or auth.uid() = user_id);

-- Anonymous visitors may create shared demo rows only.
drop policy if exists "meter_logs_insert_anon" on public.meter_logs;
create policy "meter_logs_insert_anon"
  on public.meter_logs for insert
  to anon
  with check (user_id is null);

-- UPDATE — scoped to your own rows.
drop policy if exists "meter_logs_update" on public.meter_logs;
create policy "meter_logs_update"
  on public.meter_logs for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DELETE — scoped to your own rows.
drop policy if exists "meter_logs_delete" on public.meter_logs;
create policy "meter_logs_delete"
  on public.meter_logs for delete
  to authenticated
  using (auth.uid() = user_id);

