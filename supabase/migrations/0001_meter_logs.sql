-- =============================================================================
-- PowerShield — meter_logs schema
-- =============================================================================
-- Users log the RAW cumulative meter index (e.g. 4580 kWh). Delta units are
-- NEVER stored: they are always derived at read time by comparing the current
-- reading against the cycle-start baseline reading.
-- =============================================================================

create table if not exists public.meter_logs (
  id            uuid        primary key default gen_random_uuid(),
  -- Raw meter display value, e.g. 4580.00
  reading_value numeric(12, 2) not null check (reading_value >= 0),
  -- Calendar date the reading was taken
  reading_date  date        not null,
  created_at    timestamptz not null default now()
);

-- Performance: the dashboard always sorts by date desc and filters by cycle.
create index if not exists meter_logs_reading_date_idx
  on public.meter_logs (reading_date desc, created_at desc);

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Reads are public so the dashboard can render without an account, while
-- writes are restricted to the authenticated role. Replace "public" with
-- `auth.uid() = user_id` once the auth/profile schema lands.
-- ============================================================================

alter table public.meter_logs enable row level security;

-- SELECT: anyone may read readings
drop policy if exists "meter_logs_select" on public.meter_logs;
create policy "meter_logs_select"
  on public.meter_logs for select
  to anon, authenticated
  using (true);

-- INSERT: only signed-in users may add readings
drop policy if exists "meter_logs_insert" on public.meter_logs;
create policy "meter_logs_insert"
  on public.meter_logs for insert
  to authenticated
  with check (true);

-- UPDATE / DELETE: only signed-in users may modify their rows
drop policy if exists "meter_logs_update" on public.meter_logs;
create policy "meter_logs_update"
  on public.meter_logs for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "meter_logs_delete" on public.meter_logs;
create policy "meter_logs_delete"
  on public.meter_logs for delete
  to authenticated
  using (true);
