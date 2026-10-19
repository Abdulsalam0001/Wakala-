create table if not exists wallet_requests (
  id bigserial primary key,
  reference text not null unique,
  user_id uuid not null references users(id) on delete cascade,
  request_type text not null check (request_type in ('deposit','transfer','withdrawal')),
  amount numeric(30,10) not null check (amount > 0),
  currency text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'pending_admin_review'
    check (status in ('pending_admin_review','approved','rejected','completed')),
  admin_note text,
  reviewed_by uuid references users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wallet_requests_user_created
  on wallet_requests(user_id, created_at desc);
create index if not exists idx_wallet_requests_status_created
  on wallet_requests(status, created_at desc);
