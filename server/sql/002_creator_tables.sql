-- Wakala Neon extension: creator data used by the original Earn with Wakala pages.
create table if not exists creator_campaigns (
  id bigint generated always as identity primary key,
  title text not null,
  platform text,
  content_type text,
  reward_per_1000_impressions numeric(20,6) not null default 0,
  max_reward numeric(20,6),
  status text not null default 'active',
  application_count integer not null default 0,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists creator_applications (
  id bigint generated always as identity primary key,
  user_id uuid not null references users(id) on delete cascade,
  platform text,
  username text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create table if not exists creator_submissions (
  id bigint generated always as identity primary key,
  campaign_id bigint references creator_campaigns(id) on delete set null,
  application_id bigint references creator_applications(id) on delete set null,
  user_id uuid not null references users(id) on delete cascade,
  platform text not null,
  post_url text not null,
  reported_impressions bigint not null default 0,
  status text not null default 'pending',
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references users(id) on delete set null,
  verified_impressions bigint,
  calculated_reward numeric(20,6),
  payout_status text not null default 'pending',
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creator_campaigns_status_idx on creator_campaigns(status);
create index if not exists creator_submissions_user_id_idx on creator_submissions(user_id);
create index if not exists creator_submissions_campaign_id_idx on creator_submissions(campaign_id);
create index if not exists creator_submissions_created_at_idx on creator_submissions(created_at desc);
