create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  email_verified_at timestamptz,
  status text not null default 'active' check (status in ('active','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references users(id) on delete cascade,
  full_name text,
  email text not null,
  phone text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wallets (
  id bigserial primary key,
  user_id uuid not null unique references users(id) on delete cascade,
  account_number text not null unique,
  status text not null default 'active' check (status in ('active','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wallet_balances (
  id bigserial primary key,
  wallet_id bigint not null references wallets(id) on delete cascade,
  currency text not null,
  available numeric(30,10) not null default 0,
  pending numeric(30,10) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(wallet_id,currency)
);

create table if not exists transactions (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  wallet_id bigint references wallets(id) on delete set null,
  amount numeric(30,10) not null,
  currency text not null,
  type text not null,
  status text not null default 'pending',
  description text,
  reference text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists waitlist_signups (
  id bigserial primary key,
  name text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists esim_orders (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  country_code text not null,
  country_name text not null,
  currency text not null,
  plan_data text not null,
  validity_days integer not null,
  price_usd numeric(10,2) not null,
  customer_price numeric(10,2) not null,
  delivery_email text not null,
  device text not null,
  notes text,
  status text not null default 'pending_admin_review',
  provisioning_target text default 'within_1_hour',
  iccid text,
  qr_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_roles (
  id bigserial primary key,
  name text not null unique,
  description text,
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists admin_users (
  id bigserial primary key,
  user_id uuid not null unique references users(id) on delete cascade,
  role_id bigint not null references admin_roles(id),
  status text not null default 'active' check (status in ('active','inactive','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into admin_roles(name,description,permissions) values
('super_admin','Full system access','["all"]'),
('admin','Standard admin access','["users","balances","esim","creators"]'),
('moderator','Content moderation','["creators","review"]')
on conflict (name) do nothing;

create index if not exists idx_transactions_user_created on transactions(user_id,created_at desc);
create index if not exists idx_esim_orders_user_created on esim_orders(user_id,created_at desc);
create index if not exists idx_profiles_email on profiles(email);

create or replace function create_wakala_wallet()
returns trigger
language plpgsql
as $$
declare
  account_no text;
  wallet_id_value bigint;
begin
  insert into profiles(id,email) values(new.id,new.email)
  on conflict(id) do update set email=excluded.email,updated_at=now();

  loop
    account_no := 'WK' || lpad(floor(random()*100000000)::bigint::text,8,'0');
    exit when not exists(select 1 from wallets where account_number=account_no);
  end loop;

  insert into wallets(user_id,account_number)
  values(new.id,account_no)
  returning id into wallet_id_value;

  insert into wallet_balances(wallet_id,currency)
  values
    (wallet_id_value,'NGN'),(wallet_id_value,'USD'),(wallet_id_value,'KES'),
    (wallet_id_value,'TZS'),(wallet_id_value,'RWF'),(wallet_id_value,'USDC'),
    (wallet_id_value,'USDT'),(wallet_id_value,'BTC')
  on conflict(wallet_id,currency) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_create_wakala_wallet on users;
create trigger trg_create_wakala_wallet
after insert on users
for each row execute function create_wakala_wallet();
