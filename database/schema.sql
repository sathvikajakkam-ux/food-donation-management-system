-- Food Donation Management System
-- Run this entire script in Supabase Dashboard -> SQL Editor.
-- Server-side service-role access bypasses RLS; API routes enforce authorization.
-- Direct client access to these tables is intentionally blocked by RLS.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 80),
  role text not null check (role in ('donor', 'recipient')),
  created_at timestamptz not null default now()
);

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 3 and 100),
  description text not null check (char_length(trim(description)) between 5 and 1000),
  food_type text not null check (char_length(trim(food_type)) between 1 and 60),
  quantity integer not null check (quantity between 1 and 100000),
  unit text not null check (unit in ('servings', 'kg', 'boxes', 'packs')),
  pickup_location text not null check (char_length(trim(pickup_location)) between 5 and 240),
  expires_at timestamptz not null,
  status text not null default 'available'
    check (status in ('available', 'claimed', 'collected', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.donations(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'collected', 'cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint claims_donation_recipient_unique unique (donation_id, recipient_id)
);

create index if not exists donations_status_expiry_idx on public.donations(status, expires_at);
create index if not exists donations_donor_created_idx on public.donations(donor_id, created_at desc);
create index if not exists claims_recipient_created_idx on public.claims(recipient_id, created_at desc);
create index if not exists claims_donation_status_idx on public.claims(donation_id, status);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists donations_set_updated_at on public.donations;
create trigger donations_set_updated_at before update on public.donations
for each row execute function public.set_updated_at();

-- Atomically claim a donation so two recipients cannot claim the same food.
create or replace function public.claim_donation(p_donation_id uuid, p_recipient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.donations%rowtype;
  c public.claims%rowtype;
begin
  if not exists (select 1 from public.profiles where id = p_recipient_id and role = 'recipient') then
    raise exception 'Recipient account is not valid';
  end if;

  select * into d from public.donations
    where id = p_donation_id for update;
  if not found then raise exception 'Donation not found'; end if;
  if d.status <> 'available' then raise exception 'Donation is not available'; end if;
  if d.expires_at <= now() then
    update public.donations set status = 'expired' where id = d.id;
    raise exception 'Donation has expired';
  end if;

  insert into public.claims(donation_id, recipient_id, status)
    values (d.id, p_recipient_id, 'pending')
    returning * into c;
  update public.donations set status = 'claimed' where id = d.id;
  return jsonb_build_object('id', c.id, 'donation_id', c.donation_id, 'status', c.status, 'created_at', c.created_at);
end;
$$;

create or replace function public.cancel_claim(p_claim_id uuid, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.claims%rowtype;
begin
  select * into c from public.claims where id = p_claim_id for update;
  if not found then raise exception 'Claim not found'; end if;
  if c.recipient_id <> p_actor_id then raise exception 'Not allowed to cancel this claim'; end if;
  if c.status <> 'pending' then raise exception 'Claim is not pending'; end if;

  update public.claims set status = 'cancelled' where id = c.id returning * into c;
  update public.donations set status = case when expires_at <= now() then 'expired' else 'available' end
    where id = c.donation_id and status = 'claimed';
  return jsonb_build_object('id', c.id, 'donation_id', c.donation_id, 'status', c.status);
end;
$$;

create or replace function public.complete_claim(p_claim_id uuid, p_donor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.claims%rowtype;
  d public.donations%rowtype;
begin
  select * into c from public.claims where id = p_claim_id for update;
  if not found then raise exception 'Claim not found'; end if;
  select * into d from public.donations where id = c.donation_id for update;
  if not found or d.donor_id <> p_donor_id then raise exception 'Not allowed to complete this claim'; end if;
  if c.status <> 'pending' or d.status <> 'claimed' then raise exception 'Claim is not pending'; end if;

  update public.claims set status = 'collected', completed_at = now() where id = c.id returning * into c;
  update public.donations set status = 'collected' where id = d.id;
  return jsonb_build_object('id', c.id, 'donation_id', c.donation_id, 'status', c.status, 'completed_at', c.completed_at);
end;
$$;

-- RLS protects against accidental direct browser access. The application accesses
-- data only through its authorized Express API using a server-only service key.
alter table public.profiles enable row level security;
alter table public.donations enable row level security;
alter table public.claims enable row level security;

revoke all on public.profiles, public.donations, public.claims from anon, authenticated;
revoke execute on function public.claim_donation(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.cancel_claim(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.complete_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_donation(uuid, uuid) to service_role;
grant execute on function public.cancel_claim(uuid, uuid) to service_role;
grant execute on function public.complete_claim(uuid, uuid) to service_role;
