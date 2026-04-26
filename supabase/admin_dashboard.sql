create extension if not exists pgcrypto;

create table if not exists public.owner_admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid,
  admin_email text,
  action text not null,
  target_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists owner_admin_audit_events_created_idx
  on public.owner_admin_audit_events (created_at desc);

create index if not exists owner_admin_audit_events_target_idx
  on public.owner_admin_audit_events (target_user_id, created_at desc);

alter table public.owner_admin_audit_events enable row level security;

drop policy if exists owner_admin_audit_events_no_client_access on public.owner_admin_audit_events;
create policy owner_admin_audit_events_no_client_access
on public.owner_admin_audit_events
for all
using (false)
with check (false);

create table if not exists public.owner_admin_profiles (
  admin_user_id uuid primary key,
  email text,
  full_name text,
  phone text,
  avatar_url text,
  organization_name text,
  organization_website text,
  role_title text,
  timezone text not null default 'Asia/Kolkata',
  dashboard_theme text not null default 'system',
  density text not null default 'comfortable',
  accent_color text not null default '#5b45ff',
  notifications jsonb not null default '{
    "liveEventSound": false,
    "criticalWebhookAlerts": true,
    "billingAlerts": true,
    "serverAlerts": true,
    "weeklyOpsDigest": false
  }'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists owner_admin_profiles_updated_idx
  on public.owner_admin_profiles (updated_at desc);

alter table public.owner_admin_profiles enable row level security;

drop policy if exists owner_admin_profiles_no_client_access on public.owner_admin_profiles;
create policy owner_admin_profiles_no_client_access
on public.owner_admin_profiles
for all
using (false)
with check (false);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'owner-admin-profile-pictures',
  'owner-admin-profile-pictures',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  table_name text;
  realtime_tables text[] := array[
    'app_profiles',
    'meta_channels',
    'instagram_channels',
    'messenger_channels',
    'conversation_threads',
    'conversation_messages',
    'call_logs',
    'call_sessions',
    'meta_lead_capture_events',
    'whatsapp_payment_configuration_events',
    'credit_ledger',
    'email_campaigns',
    'user_notifications',
    'owner_admin_audit_events',
    'owner_admin_profiles'
  ];
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array realtime_tables loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end
$$;
