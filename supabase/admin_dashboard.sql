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

create table if not exists public.owner_admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null unique,
  full_name text,
  role_title text,
  role text not null default 'admin',
  status text not null default 'invited',
  permissions jsonb not null default '[]'::jsonb,
  invited_by uuid,
  invited_at timestamptz,
  last_access_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint owner_admin_users_role_check check (role in ('primary_owner', 'admin')),
  constraint owner_admin_users_status_check check (status in ('active', 'invited', 'disabled'))
);

create index if not exists owner_admin_users_role_idx
  on public.owner_admin_users (role, status);

create index if not exists owner_admin_users_updated_idx
  on public.owner_admin_users (updated_at desc);

alter table public.owner_admin_users enable row level security;

drop policy if exists owner_admin_users_no_client_access on public.owner_admin_users;
create policy owner_admin_users_no_client_access
on public.owner_admin_users
for all
using (false)
with check (false);

insert into public.owner_admin_users (
  email,
  full_name,
  role_title,
  role,
  status,
  permissions,
  invited_at
)
values (
  'admin@connektly.in',
  'Primary Owner',
  'Primary Owner',
  'primary_owner',
  'active',
  '["command_center", "organizations", "global_users", "platform_settings", "payments", "logs_monitoring", "global_integrations", "webhooks", "server_status", "security_audit"]'::jsonb,
  timezone('utc', now())
)
on conflict (email) do update
set
  role = 'primary_owner',
  status = 'active',
  permissions = excluded.permissions,
  updated_at = timezone('utc', now());

update public.owner_admin_users admin_row
set auth_user_id = auth_user.id,
    updated_at = timezone('utc', now())
from auth.users auth_user
where lower(auth_user.email) = 'admin@connektly.in'
  and admin_row.email = 'admin@connektly.in'
  and admin_row.auth_user_id is distinct from auth_user.id;

create table if not exists public.user_platform_settings (
  section text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_platform_settings_section_check check (
    section in ('pricing_plans', 'feature_flags', 'rate_limits', 'api_keys', 'email_templates')
  )
);

create index if not exists user_platform_settings_updated_idx
  on public.user_platform_settings (updated_at desc);

alter table public.user_platform_settings enable row level security;

drop policy if exists user_platform_settings_no_client_write on public.user_platform_settings;
create policy user_platform_settings_no_client_write
on public.user_platform_settings
for all
using (false)
with check (false);

create or replace function public.get_user_platform_settings(p_org_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb := '{}'::jsonb;
  feature_flags jsonb;
  feature_override jsonb;
  effective_flags jsonb;
  rate_limits jsonb;
  rate_override jsonb;
begin
  select coalesce(jsonb_object_agg(section, settings), '{}'::jsonb)
  into result
  from public.user_platform_settings
  where section <> 'api_keys';

  feature_flags := result->'feature_flags';
  if jsonb_typeof(feature_flags) = 'object' then
    if p_org_id is not null
      and jsonb_typeof(feature_flags->'orgOverrides') = 'array'
      and jsonb_typeof(feature_flags->'flags') = 'array' then
      select override_item
      into feature_override
      from jsonb_array_elements(feature_flags->'orgOverrides') as override_item
      where override_item->>'orgId' = p_org_id::text
      limit 1;

      if feature_override is not null and jsonb_typeof(feature_override->'flags') = 'object' then
        select coalesce(
          jsonb_agg(
            case
              when (feature_override->'flags') ? (flag_item->>'key') then
                jsonb_set(
                  flag_item,
                  '{enabled}',
                  to_jsonb(((feature_override->'flags')->>(flag_item->>'key'))::boolean),
                  true
                )
              else flag_item
            end
          ),
          '[]'::jsonb
        )
        into effective_flags
        from jsonb_array_elements(feature_flags->'flags') as flag_item;

        feature_flags := jsonb_set(feature_flags, '{flags}', effective_flags, true);
      end if;
    end if;

    result := jsonb_set(result, '{feature_flags}', feature_flags - 'orgOverrides', true);
  end if;

  rate_limits := result->'rate_limits';
  if jsonb_typeof(rate_limits) = 'object' then
    if p_org_id is not null and jsonb_typeof(rate_limits->'orgOverrides') = 'array' then
      select override_item
      into rate_override
      from jsonb_array_elements(rate_limits->'orgOverrides') as override_item
      where override_item->>'orgId' = p_org_id::text
      limit 1;

      if rate_override is not null then
        if rate_override ? 'messagesPerMinute' then
          rate_limits := jsonb_set(rate_limits, '{default,messagesPerMinute}', rate_override->'messagesPerMinute', true);
        end if;

        if rate_override ? 'apiRequestsPerMinute' then
          rate_limits := jsonb_set(rate_limits, '{default,apiRequestsPerMinute}', rate_override->'apiRequestsPerMinute', true);
        end if;
      end if;
    end if;

    result := jsonb_set(result, '{rate_limits}', rate_limits - 'orgOverrides', true);
  end if;

  return result;
end;
$$;

grant execute on function public.get_user_platform_settings(uuid) to anon, authenticated;

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
    'owner_admin_profiles',
    'owner_admin_users',
    'user_platform_settings'
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
