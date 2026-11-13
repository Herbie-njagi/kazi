-- Move Daraja credential management exclusively to SuperAdmin (platform_admins)
create or replace function public.get_platform_businesses()
returns table (
  id uuid,
  name text,
  payment_method text,
  payment_identifier text,
  subscription_status text,
  mpesa_configured boolean,
  mpesa_environment text,
  mpesa_shortcode text,
  mpesa_consumer_key text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required';
  end if;

  return query
  select
    b.id,
    b.name,
    b.payment_method,
    b.payment_identifier,
    case
      when s.status = 'active' and s.current_period_end > now() then 'active'
      when s.status is not null then 'past_due'
      else 'unsubscribed'
    end as subscription_status,
    (c.business_id is not null) as mpesa_configured,
    c.environment as mpesa_environment,
    c.shortcode as mpesa_shortcode,
    c.consumer_key as mpesa_consumer_key
  from public.businesses b
  left join public.business_subscriptions s on s.business_id = b.id
  left join public.business_mpesa_credentials c on c.business_id = b.id
  order by b.name;
end;
$$;

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
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required';
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
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required';
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
  if (select auth.role()) <> 'service_role'
    and (
      (select auth.uid()) is null
      or (not public.is_business_member(p_business_id) and not public.is_platform_admin())
    ) then
    raise exception 'Business membership or platform administrator access required';
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

revoke all on function public.get_platform_businesses() from public, anon;
grant execute on function public.get_platform_businesses() to authenticated;
