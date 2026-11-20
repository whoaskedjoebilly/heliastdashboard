-- Security hardening for the Heliast dashboard.
-- Apply in the Supabase SQL editor (project kkvqlplqhdtylwryttpi) AFTER
-- schema.sql. Safe to run more than once.
--
-- What this does:
--   1. Issues a per-client tracking_key so the public visitor pixel cannot
--      write another customer's Live tab by UUID alone.
--   2. Creates dashboard_reports, dashboard_custom_reports, and
--      dashboard_ga4_pages if they are not already there (the app reads
--      and writes them, but schema.sql never defined them).
--   3. Turns on row level security, forces it for the table owner, and
--      installs owner-scoped policies. The service role still bypasses
--      RLS; the anon key does not.
--   4. Revokes table privileges from anon. Authenticated clients keep
--      only the reads and writes the dashboard UI needs.
--
-- After this runs, redeploy supabase/functions/track and update each
-- site's tracking snippet with the key shown on that client's Settings tab.
-- Existing snippets that send only client_id will start getting 401s once
-- the new function is deployed.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- tracking key
-- ---------------------------------------------------------------------------

alter table public.dashboard_clients
  add column if not exists tracking_key text;

update public.dashboard_clients
  set tracking_key = encode(gen_random_bytes(16), 'hex')
  where tracking_key is null;

alter table public.dashboard_clients
  alter column tracking_key set default encode(gen_random_bytes(16), 'hex');

alter table public.dashboard_clients
  alter column tracking_key set not null;

create unique index if not exists dashboard_clients_tracking_key_key
  on public.dashboard_clients (tracking_key);

-- The connect callbacks store the provider account id here. schema.sql
-- predates that column; add it if this database was created from the file.
alter table public.dashboard_client_integrations
  add column if not exists external_account_id text;

-- ---------------------------------------------------------------------------
-- tables the app already uses that were missing from schema.sql
-- ---------------------------------------------------------------------------

create table if not exists public.dashboard_ga4_pages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.dashboard_clients(id) on delete cascade,
  date date not null,
  page_path text not null,
  sessions int,
  engaged_sessions int,
  bounce_rate numeric,
  avg_engagement_sec numeric,
  page_views int,
  unique (client_id, date, page_path)
);

create table if not exists public.dashboard_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.dashboard_clients(id) on delete cascade,
  title text not null,
  prompt text not null default '',
  content text not null default '',
  created_at timestamptz not null default now(),
  constraint dashboard_reports_title_len check (char_length(title) between 1 and 200),
  constraint dashboard_reports_prompt_len check (char_length(prompt) <= 4000),
  constraint dashboard_reports_content_len check (char_length(content) <= 100000)
);

create table if not exists public.dashboard_custom_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.dashboard_clients(id) on delete cascade,
  title text not null,
  config jsonb not null,
  created_at timestamptz not null default now(),
  constraint dashboard_custom_reports_title_len check (char_length(title) between 1 and 200)
);

-- Tables that already existed (created outside schema.sql) do not pick up
-- constraints from CREATE TABLE IF NOT EXISTS. Add them when missing.
-- A failure here means existing rows are longer than the new limit; the
-- notice is intentional so the rest of this script still applies.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dashboard_reports_title_len') then
    alter table public.dashboard_reports
      add constraint dashboard_reports_title_len check (char_length(title) between 1 and 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_reports_prompt_len') then
    alter table public.dashboard_reports
      add constraint dashboard_reports_prompt_len check (char_length(prompt) <= 4000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_reports_content_len') then
    alter table public.dashboard_reports
      add constraint dashboard_reports_content_len check (char_length(content) <= 100000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_custom_reports_title_len') then
    alter table public.dashboard_custom_reports
      add constraint dashboard_custom_reports_title_len check (char_length(title) between 1 and 200);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.dashboard_ga4_pages'::regclass and contype = 'u'
  ) then
    alter table public.dashboard_ga4_pages
      add constraint dashboard_ga4_pages_client_date_path_key unique (client_id, date, page_path);
  end if;
exception when others then
  raise notice 'length or uniqueness constraints skipped: %', sqlerrm;
end $$;

create index if not exists dashboard_reports_client_created_idx
  on public.dashboard_reports (client_id, created_at desc);

create index if not exists dashboard_custom_reports_client_created_idx
  on public.dashboard_custom_reports (client_id, created_at desc);

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------

alter table public.dashboard_clients enable row level security;
alter table public.dashboard_client_integrations enable row level security;
alter table public.dashboard_daily_traffic enable row level security;
alter table public.dashboard_keyword_rankings enable row level security;
alter table public.dashboard_ad_campaigns enable row level security;
alter table public.dashboard_social_stats enable row level security;
alter table public.dashboard_live_visitors enable row level security;
alter table public.dashboard_leads enable row level security;
alter table public.dashboard_shopify_sales enable row level security;
alter table public.dashboard_ga4_pages enable row level security;
alter table public.dashboard_reports enable row level security;
alter table public.dashboard_custom_reports enable row level security;

alter table public.dashboard_clients force row level security;
alter table public.dashboard_client_integrations force row level security;
alter table public.dashboard_daily_traffic force row level security;
alter table public.dashboard_keyword_rankings force row level security;
alter table public.dashboard_ad_campaigns force row level security;
alter table public.dashboard_social_stats force row level security;
alter table public.dashboard_live_visitors force row level security;
alter table public.dashboard_leads force row level security;
alter table public.dashboard_shopify_sales force row level security;
alter table public.dashboard_ga4_pages force row level security;
alter table public.dashboard_reports force row level security;
alter table public.dashboard_custom_reports force row level security;

-- Recreate the known policies so a previously widened policy of the same
-- name is put back. Policies with some other name are not dropped — review
-- `select * from pg_policies where schemaname = 'public' and tablename like 'dashboard_%'`
-- after applying this file and drop any policy that is not owner-scoped.

drop policy if exists "clients read their own record" on public.dashboard_clients;
create policy "clients read their own record"
on public.dashboard_clients for select
using (owner_user_id = auth.uid());

drop policy if exists "clients read their own traffic" on public.dashboard_daily_traffic;
create policy "clients read their own traffic"
on public.dashboard_daily_traffic for select
using (client_id in (select id from public.dashboard_clients where owner_user_id = auth.uid()));

drop policy if exists "clients read their own keyword rankings" on public.dashboard_keyword_rankings;
create policy "clients read their own keyword rankings"
on public.dashboard_keyword_rankings for select
using (client_id in (select id from public.dashboard_clients where owner_user_id = auth.uid()));

drop policy if exists "clients read their own ad campaigns" on public.dashboard_ad_campaigns;
create policy "clients read their own ad campaigns"
on public.dashboard_ad_campaigns for select
using (client_id in (select id from public.dashboard_clients where owner_user_id = auth.uid()));

drop policy if exists "clients read their own social stats" on public.dashboard_social_stats;
create policy "clients read their own social stats"
on public.dashboard_social_stats for select
using (client_id in (select id from public.dashboard_clients where owner_user_id = auth.uid()));

drop policy if exists "clients read their own live visitors" on public.dashboard_live_visitors;
create policy "clients read their own live visitors"
on public.dashboard_live_visitors for select
using (client_id in (select id from public.dashboard_clients where owner_user_id = auth.uid()));

drop policy if exists "clients manage their own leads" on public.dashboard_leads;
create policy "clients manage their own leads"
on public.dashboard_leads for all
using (client_id in (select id from public.dashboard_clients where owner_user_id = auth.uid()))
with check (client_id in (select id from public.dashboard_clients where owner_user_id = auth.uid()));

drop policy if exists "clients read their own shopify sales" on public.dashboard_shopify_sales;
create policy "clients read their own shopify sales"
on public.dashboard_shopify_sales for select
using (client_id in (select id from public.dashboard_clients where owner_user_id = auth.uid()));

drop policy if exists "clients read their own ga4 pages" on public.dashboard_ga4_pages;
create policy "clients read their own ga4 pages"
on public.dashboard_ga4_pages for select
using (client_id in (select id from public.dashboard_clients where owner_user_id = auth.uid()));

drop policy if exists "clients manage their own reports" on public.dashboard_reports;
create policy "clients manage their own reports"
on public.dashboard_reports for all
using (client_id in (select id from public.dashboard_clients where owner_user_id = auth.uid()))
with check (client_id in (select id from public.dashboard_clients where owner_user_id = auth.uid()));

drop policy if exists "clients manage their own custom reports" on public.dashboard_custom_reports;
create policy "clients manage their own custom reports"
on public.dashboard_custom_reports for all
using (client_id in (select id from public.dashboard_clients where owner_user_id = auth.uid()))
with check (client_id in (select id from public.dashboard_clients where owner_user_id = auth.uid()));

-- No policy on dashboard_client_integrations. It holds OAuth tokens.
-- Only the service role (admin routes, cron, /api/me/integrations) reads it.

-- ---------------------------------------------------------------------------
-- privileges
--
-- anon must not be able to touch these tables even if RLS is later turned
-- off. authenticated keeps the operations the browser client performs.
-- service_role is not modified.
-- ---------------------------------------------------------------------------

revoke all on table public.dashboard_clients from anon;
revoke all on table public.dashboard_client_integrations from anon, authenticated;
revoke all on table public.dashboard_daily_traffic from anon;
revoke all on table public.dashboard_keyword_rankings from anon;
revoke all on table public.dashboard_ad_campaigns from anon;
revoke all on table public.dashboard_social_stats from anon;
revoke all on table public.dashboard_live_visitors from anon;
revoke all on table public.dashboard_leads from anon;
revoke all on table public.dashboard_shopify_sales from anon;
revoke all on table public.dashboard_ga4_pages from anon;
revoke all on table public.dashboard_reports from anon;
revoke all on table public.dashboard_custom_reports from anon;

grant select on table public.dashboard_clients to authenticated;
grant select on table public.dashboard_daily_traffic to authenticated;
grant select on table public.dashboard_keyword_rankings to authenticated;
grant select on table public.dashboard_ad_campaigns to authenticated;
grant select on table public.dashboard_social_stats to authenticated;
grant select on table public.dashboard_live_visitors to authenticated;
grant select, insert, update, delete on table public.dashboard_leads to authenticated;
grant select on table public.dashboard_shopify_sales to authenticated;
grant select on table public.dashboard_ga4_pages to authenticated;
grant select, insert, update, delete on table public.dashboard_reports to authenticated;
grant select, insert, update, delete on table public.dashboard_custom_reports to authenticated;
