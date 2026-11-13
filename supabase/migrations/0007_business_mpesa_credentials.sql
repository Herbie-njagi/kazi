-- Per-business Safaricom M-Pesa Daraja credentials for direct STK Push
create table if not exists public.business_mpesa_credentials (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  shortcode text not null check (char_length(btrim(shortcode)) between 4 and 12),
  consumer_key text not null check (char_length(btrim(consumer_key)) >= 8),
  consumer_secret text not null check (char_length(btrim(consumer_secret)) >= 8),
  passkey text not null check (char_length(btrim(passkey)) >= 12),
  updated_at timestamptz not null default now()
);

alter table public.business_mpesa_credentials enable row level security;

revoke all on table public.business_mpesa_credentials from anon, authenticated;
grant select, insert, update, delete on table public.business_mpesa_credentials to service_role;

create or replace function public.save_business_mpesa_credentials(
  p_business_id uuid,
  p_environment text,
  p_shortcode text,
  p_consumer_key text,
  p_consumer_secret text default null,
  p_passkey text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_record public.business_mpesa_credentials%rowtype;
  next_secret text;
  next_passkey text;
begin
  if (select auth.uid()) is null
    or not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'Business owner or administrator access required';
  end if;

  if p_environment not in ('sandbox', 'production') then
    raise exception 'Environment must be sandbox or production';
  end if;

  if p_shortcode is null or char_length(btrim(p_shortcode)) not between 4 and 12 then
    raise exception 'Shortcode must be between 4 and 12 characters';
  end if;

  if p_consumer_key is null or char_length(btrim(p_consumer_key)) < 8 then
    raise exception 'Consumer key is required';
  end if;

  select * into existing_record
  from public.business_mpesa_credentials
  where business_id = p_business_id;

  next_secret := coalesce(nullif(btrim(p_consumer_secret), ''), existing_record.consumer_secret);
  next_passkey := coalesce(nullif(btrim(p_passkey), ''), existing_record.passkey);

  if next_secret is null or char_length(next_secret) < 8 then
    raise exception 'Consumer secret is required';
  end if;

  if next_passkey is null or char_length(next_passkey) < 12 then
    raise exception 'Daraja passkey is required';
  end if;

  insert into public.business_mpesa_credentials (
    business_id, environment, shortcode, consumer_key, consumer_secret, passkey, updated_at
  )
  values (
    p_business_id,
    p_environment,
    btrim(p_shortcode),
    btrim(p_consumer_key),
    next_secret,
    next_passkey,
    now()
  )
  on conflict (business_id) do update
  set environment = excluded.environment,
      shortcode = excluded.shortcode,
      consumer_key = excluded.consumer_key,
      consumer_secret = excluded.consumer_secret,
      passkey = excluded.passkey,
      updated_at = now();
end;
$$;

create or replace function public.get_business_mpesa_status(p_business_id uuid)
returns table (
  configured boolean,
  environment text,
  shortcode text,
  consumer_key text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_business_member(p_business_id) then
    raise exception 'Business membership required';
  end if;

  return query
  select
    true as configured,
    c.environment,
    c.shortcode,
    c.consumer_key
  from public.business_mpesa_credentials c
  where c.business_id = p_business_id;
end;
$$;

create or replace function public.get_business_mpesa_credentials(p_business_id uuid)
returns table (
  environment text,
  shortcode text,
  consumer_key text,
  consumer_secret text,
  passkey text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_business_member(p_business_id) then
    raise exception 'Business membership required';
  end if;

  return query
  select
    c.environment,
    c.shortcode,
    c.consumer_key,
    c.consumer_secret,
    c.passkey
  from public.business_mpesa_credentials c
  where c.business_id = p_business_id;
end;
$$;

revoke all on function public.save_business_mpesa_credentials(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.get_business_mpesa_status(uuid) from public, anon;
revoke all on function public.get_business_mpesa_credentials(uuid) from public, anon;

grant execute on function public.save_business_mpesa_credentials(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.get_business_mpesa_status(uuid) to authenticated;
grant execute on function public.get_business_mpesa_credentials(uuid) to authenticated;
