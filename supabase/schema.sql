-- Heliast dashboard — Supabase schema (dashboard-live-setup.md, Phase 2).
-- Applied to the "Heliast site" project (kkvqlplqhdtylwryttpi), which is
-- shared with the marketing site. That project already has its own
-- unrelated public.clients table, so every dashboard table here uses a
-- dashboard_ prefix to stay completely separate from it.

create table dashboard_clients (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id),
  name text not null,
  plan text,
  created_at timestamptz default now()
);

create table dashboard_client_integrations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references dashboard_clients(id) on delete cascade,
  platform text not null, -- 'gsc' | 'gads' | 'meta_ads' | 'instagram' | 'tiktok' | 'facebook'
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  connected_at timestamptz default now(),
  unique (client_id, platform)
);

create table dashboard_daily_traffic (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references dashboard_clients(id) on delete cascade,
  date date not null,
  sessions int,
  conversions int,
  channel text, -- 'organic' | 'paid_social' | 'paid_search' | 'direct'
  unique (client_id, date, channel)
);

create table dashboard_keyword_rankings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references dashboard_clients(id) on delete cascade,
  keyword text not null,
  position int,
  search_volume int,
  checked_at date default current_date
);

create table dashboard_ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references dashboard_clients(id) on delete cascade,
  name text not null,
  platform text, -- 'google_ads' | 'meta_ads'
  spend numeric,
  roas numeric,
  status text,
  synced_at timestamptz default now()
);

create table dashboard_social_stats (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references dashboard_clients(id) on delete cascade,
  platform text, -- 'instagram' | 'tiktok' | 'facebook'
  followers int,
  engagement_rate numeric,
  date date default current_date
);

create table dashboard_live_visitors (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references dashboard_clients(id) on delete cascade,
  page text,
  location text,
  lat numeric,
  lng numeric,
  device text,
  entered_at timestamptz default now()
);

-- CRM: a converted visitor (ad click, form fill) becomes a lead here instead
-- of just incrementing a "conversions" counter, so a client can work it
-- through a pipeline (New → Contacted → Appointment → Won/Lost) and see
-- real revenue, not just a lead count.
create table dashboard_leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references dashboard_clients(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  source text not null default 'other', -- 'google_ads' | 'meta_ads' | 'organic' | 'referral' | 'direct' | 'other'
  campaign text,
  status text not null default 'new', -- 'new' | 'contacted' | 'qualified' | 'appointment' | 'won' | 'lost'
  assigned_to text,
  estimated_value numeric,
  actual_value numeric, -- filled in once a lead is won; estimated_value is the pre-close guess
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_leads_status_check check (status in ('new', 'contacted', 'qualified', 'appointment', 'won', 'lost'))
);

create index dashboard_leads_client_status_idx on dashboard_leads(client_id, status);
create index dashboard_leads_client_created_idx on dashboard_leads(client_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security — every client-facing table only returns rows for
-- clients owned by the logged-in user. dashboard_client_integrations holds
-- OAuth tokens and is intentionally left with no client-facing read policy:
-- only admin routes using the service role key (which bypasses RLS) touch it.
-- ---------------------------------------------------------------------------

alter table dashboard_clients enable row level security;
alter table dashboard_client_integrations enable row level security;
alter table dashboard_daily_traffic enable row level security;
alter table dashboard_keyword_rankings enable row level security;
alter table dashboard_ad_campaigns enable row level security;
alter table dashboard_social_stats enable row level security;
alter table dashboard_live_visitors enable row level security;
alter table dashboard_leads enable row level security;

create policy "clients read their own record"
on dashboard_clients for select
using (owner_user_id = auth.uid());

create policy "clients read their own traffic"
on dashboard_daily_traffic for select
using (
  client_id in (select id from dashboard_clients where owner_user_id = auth.uid())
);

create policy "clients read their own keyword rankings"
on dashboard_keyword_rankings for select
using (
  client_id in (select id from dashboard_clients where owner_user_id = auth.uid())
);

create policy "clients read their own ad campaigns"
on dashboard_ad_campaigns for select
using (
  client_id in (select id from dashboard_clients where owner_user_id = auth.uid())
);

create policy "clients read their own social stats"
on dashboard_social_stats for select
using (
  client_id in (select id from dashboard_clients where owner_user_id = auth.uid())
);

create policy "clients read their own live visitors"
on dashboard_live_visitors for select
using (
  client_id in (select id from dashboard_clients where owner_user_id = auth.uid())
);

-- No policy is created on dashboard_client_integrations — it stays
-- unreadable from the client, by design.

-- Leads are read/write (not read-only) — clients add leads manually and
-- move them through the pipeline themselves, so this needs an ALL policy
-- rather than the select-only ones above.
create policy "clients manage their own leads"
on dashboard_leads for all
using (
  client_id in (select id from dashboard_clients where owner_user_id = auth.uid())
)
with check (
  client_id in (select id from dashboard_clients where owner_user_id = auth.uid())
);
