-- Masters of Arts external payment tracker for Wakala admin.
-- Apply this file in the Wakala Supabase SQL editor.

create table if not exists public.external_payment_trackers (
  id uuid primary key default gen_random_uuid(),
  tracker_reference text not null unique default (
    'WAK-EXT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  ),
  source text not null default 'masters_of_arts',
  external_order_id text not null,
  order_number text not null,
  payment_reference text not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  amount numeric(14,2) not null check (amount > 0),
  currency varchar(3) not null default 'NGN',
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment','payment_reported','paid','failed','cancelled')),
  event_type text not null default 'order_created',
  request_text text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_order_id),
  unique (source, payment_reference)
);

create index if not exists external_payment_trackers_created_idx
  on public.external_payment_trackers (created_at desc);
create index if not exists external_payment_trackers_status_idx
  on public.external_payment_trackers (status, created_at desc);

alter table public.external_payment_trackers enable row level security;

drop policy if exists "Wakala admins can view external payment trackers"
  on public.external_payment_trackers;
create policy "Wakala admins can view external payment trackers"
  on public.external_payment_trackers
  for select to authenticated
  using (public.is_active_admin());

grant select on public.external_payment_trackers to authenticated;
grant all on public.external_payment_trackers to service_role;

-- Safe for installations that created the table before the text-log field was added.
alter table public.external_payment_trackers add column if not exists request_text text not null default '';
