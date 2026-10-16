-- Wakala deposit and transfer request workflow
-- Apply this file in Supabase SQL Editor before deploying the updated pages.
create extension if not exists pgcrypto;

create table if not exists public.wallet_requests (
  id bigint generated always as identity primary key,
  reference text not null unique default ('WKREQ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id bigint references public.wallets(id) on delete set null,
  request_type text not null check (request_type in ('deposit','transfer')),
  amount numeric(20,8) not null check (amount > 0),
  currency text not null check (currency in ('NGN','USD','KES','TZS','RWF','USDC','USDT','BTC')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','processing','completed')),
  details jsonb not null default '{}'::jsonb,
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wallet_requests drop constraint if exists wallet_requests_status_check;
alter table public.wallet_requests add constraint wallet_requests_status_check check (status in ('pending','approved','rejected','processing','completed'));

create index if not exists wallet_requests_user_created_idx on public.wallet_requests(user_id, created_at desc);
create index if not exists wallet_requests_admin_queue_idx on public.wallet_requests(status, created_at asc);
alter table public.wallet_requests enable row level security;

drop policy if exists "Users can view their own wallet requests" on public.wallet_requests;
create policy "Users can view their own wallet requests" on public.wallet_requests
for select to authenticated using (auth.uid() = user_id);

revoke all on public.wallet_requests from anon, authenticated;
grant select on public.wallet_requests to authenticated;

create or replace function public.submit_wallet_request(
  p_request_type text,
  p_amount numeric,
  p_currency text,
  p_details jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  wallet_row public.wallets%rowtype;
  request_row public.wallet_requests%rowtype;
  balance_row public.wallet_balances%rowtype;
  kind text := lower(trim(coalesce(p_request_type,'')));
  curr text := upper(trim(coalesce(p_currency,'')));
  amount_value numeric := p_amount;
  detail_value jsonb := coalesce(p_details, '{}'::jsonb);
begin
  if uid is null then raise exception 'Please sign in before submitting a request'; end if;
  if kind not in ('deposit','transfer') then raise exception 'Unsupported request type'; end if;
  if amount_value is null or amount_value <= 0 or amount_value > 100000000000 then raise exception 'Enter a valid amount'; end if;
  if curr not in ('NGN','USD','KES','TZS','RWF','USDC','USDT','BTC') then raise exception 'Unsupported currency'; end if;
  if jsonb_typeof(detail_value) <> 'object' then raise exception 'Request details must be an object'; end if;
  if octet_length(detail_value::text) > 8000 then raise exception 'Request details are too large'; end if;

  select * into wallet_row from public.wallets where user_id = uid order by created_at asc, id asc limit 1;
  if wallet_row.id is null then raise exception 'Your wallet was not found. Please contact support'; end if;
  if coalesce(wallet_row.status,'active') <> 'active' then raise exception 'Your wallet is not active'; end if;

  if kind = 'transfer' then
    if nullif(trim(detail_value->>'recipient_name'),'') is null then raise exception 'Recipient name is required'; end if;
    if nullif(trim(detail_value->>'recipient_type'),'') is null then raise exception 'Recipient type is required'; end if;
    select * into balance_row from public.wallet_balances
      where wallet_id=wallet_row.id and currency=curr for update;
    if balance_row.id is null or balance_row.available < amount_value then
      raise exception 'Insufficient available balance in % for this transfer request', curr;
    end if;
    -- Reserve the requested amount. It is not paid out until an admin confirms settlement.
    update public.wallet_balances
      set available=available-amount_value, pending=pending+amount_value, updated_at=now()
      where id=balance_row.id;
  end if;

  insert into public.wallet_requests(user_id,wallet_id,request_type,amount,currency,details)
  values(uid,wallet_row.id,kind,amount_value,curr,detail_value)
  returning * into request_row;

  return jsonb_build_object('success',true,'id',request_row.id,'reference',request_row.reference,'status',request_row.status,'created_at',request_row.created_at);
end;
$$;

revoke all on function public.submit_wallet_request(text,numeric,text,jsonb) from public, anon;
grant execute on function public.submit_wallet_request(text,numeric,text,jsonb) to authenticated;

create or replace function public.list_admin_wallet_requests(p_status text default 'pending', p_type text default 'all')
returns table (
  id bigint, reference text, user_id uuid, user_name text, user_email text,
  request_type text, amount numeric, currency text, status text, details jsonb,
  admin_note text, created_at timestamptz, reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.admin_users au join public.admin_roles ar on ar.id=au.role_id
    where au.user_id=auth.uid() and au.status='active' and ar.name in ('super_admin','admin')
  ) then raise exception 'Administrator access required'; end if;
  return query
  select r.id,r.reference,r.user_id,coalesce(p.full_name,''),coalesce(p.email,''),r.request_type,
    r.amount,r.currency,r.status,r.details,r.admin_note,r.created_at,r.reviewed_at
  from public.wallet_requests r
  left join public.profiles p on p.id=r.user_id
  where (coalesce(p_status,'all')='all' or r.status=p_status)
    and (coalesce(p_type,'all')='all' or r.request_type=p_type)
  order by case when r.status='pending' then 0 else 1 end, r.created_at asc;
end;
$$;
revoke all on function public.list_admin_wallet_requests(text,text) from public, anon;
grant execute on function public.list_admin_wallet_requests(text,text) to authenticated;

create or replace function public.review_wallet_request(
  p_request_id bigint,
  p_decision text,
  p_admin_note text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.wallet_requests%rowtype;
  balance_id bigint;
  new_available numeric;
  decision text := lower(trim(coalesce(p_decision,'')));
  balance_row public.wallet_balances%rowtype;
  note text := left(trim(coalesce(p_admin_note,'')),1000);
begin
  if not exists (
    select 1 from public.admin_users au join public.admin_roles ar on ar.id=au.role_id
    where au.user_id=auth.uid() and au.status='active' and ar.name in ('super_admin','admin')
  ) then raise exception 'Administrator access required'; end if;
  if decision not in ('approve','reject','processing','complete') then raise exception 'Decision must be approve, reject, processing, or complete'; end if;

  select * into req from public.wallet_requests where id=p_request_id for update;
  if req.id is null then raise exception 'Request not found'; end if;
  if decision='complete' then
    if req.status <> 'processing' then raise exception 'Only a transfer already in processing can be completed'; end if;
  elsif req.status <> 'pending' then
    raise exception 'This request has already been reviewed';
  end if;

  if decision in ('processing','complete') and req.request_type <> 'transfer' then
    raise exception 'Only transfer requests can be processed or completed';
  end if;
  if decision='complete' and req.status <> 'processing' then
    raise exception 'Only a transfer already in processing can be completed';
  end if;
  if decision='processing' and req.status <> 'pending' then
    raise exception 'Only pending transfer requests can be processed';
  end if;

  if decision='approve' and req.request_type='deposit' then
    insert into public.wallet_balances(wallet_id,currency) values(req.wallet_id,req.currency)
      on conflict(wallet_id,currency) do nothing;
    select id into balance_id from public.wallet_balances where wallet_id=req.wallet_id and currency=req.currency for update;
    update public.wallet_balances set available=available+req.amount,updated_at=now()
      where id=balance_id returning available into new_available;
    insert into public.transactions(user_id,wallet_id,amount,currency,type,status,description,reference,metadata,completed_at)
    values(req.user_id,req.wallet_id,req.amount,req.currency,'deposit','completed',
      'Deposit verified by administrator',req.reference,
      jsonb_build_object('source','admin_reconciled_deposit','request_id',req.id,'reviewed_by',auth.uid(),'admin_note',note),now());
    update public.wallet_requests set status='approved',admin_note=note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=req.id;
    return jsonb_build_object('success',true,'reference',req.reference,'status','approved','credited',true,'new_available_balance',new_available);
  end if;

  if req.request_type='transfer' and decision='complete' then
    select * into balance_row from public.wallet_balances
      where wallet_id=req.wallet_id and currency=req.currency for update;
    if balance_row.id is null or balance_row.pending < req.amount then
      raise exception 'Reserved transfer balance is missing; contact engineering before completing';
    end if;
    update public.wallet_balances set pending=pending-req.amount,updated_at=now() where id=balance_row.id;
    insert into public.transactions(user_id,wallet_id,amount,currency,type,status,description,reference,metadata,completed_at)
    values(req.user_id,req.wallet_id,-req.amount,req.currency,'transfer','completed',
      'Transfer completed by administrator',req.reference,
      jsonb_build_object('source','admin_completed_transfer','request_id',req.id,'reviewed_by',auth.uid(),'admin_note',note),now());
    update public.wallet_requests set status='completed',admin_note=note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=req.id;
    return jsonb_build_object('success',true,'reference',req.reference,'status','completed','credited',false,'debited',true);
  end if;

  if req.request_type='transfer' and decision='reject' then
    select * into balance_row from public.wallet_balances
      where wallet_id=req.wallet_id and currency=req.currency for update;
    if balance_row.id is null or balance_row.pending < req.amount then
      raise exception 'Reserved transfer balance is missing; contact engineering before rejecting';
    end if;
    update public.wallet_balances
      set available=available+req.amount,pending=pending-req.amount,updated_at=now()
      where id=balance_row.id;
  end if;

  update public.wallet_requests set
    status=case
      when decision='reject' then 'rejected'
      when req.request_type='transfer' then 'processing'
      else 'processing'
    end,
    admin_note=note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
  where id=req.id;
  return jsonb_build_object('success',true,'reference',req.reference,'status',case when decision='reject' then 'rejected' else 'processing' end,'credited',false,'reserved',req.request_type='transfer');
end;
$$;
revoke all on function public.review_wallet_request(bigint,text,text) from public, anon;
grant execute on function public.review_wallet_request(bigint,text,text) to authenticated;
