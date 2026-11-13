-- Self-contained, idempotent migration for platform admin & 30/360-day subscriptions
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

create table if not exists public.business_subscriptions (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  provider text not null check (provider in ('mpesa', 'paystack')),
  billing_interval text not null check (billing_interval in ('monthly', 'yearly')),
  status text not null check (status in ('active', 'past_due', 'cancelled')),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  provider_subscription_id text,
  provider_customer_id text,
  updated_at timestamptz not null default now(),
  check (current_period_end > current_period_start),
  unique (provider, provider_subscription_id)
);

create table if not exists public.subscription_checkouts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('mpesa', 'paystack')),
  billing_interval text not null check (billing_interval in ('monthly', 'yearly')),
  amount_kes integer not null check (amount_kes in (500, 6000)),
  customer_email text not null,
  provider_reference text not null unique,
  provider_checkout_id text,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (provider, provider_checkout_id)
);

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  provider text not null check (provider in ('mpesa', 'paystack')),
  provider_reference text not null,
  amount_kes integer not null check (amount_kes in (500, 6000)),
  paid_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create index if not exists subscription_checkouts_business_created_idx
  on public.subscription_checkouts (business_id, created_at desc);
create index if not exists subscription_payments_business_paid_idx
  on public.subscription_payments (business_id, paid_at desc);

alter table public.platform_admins enable row level security;
alter table public.business_subscriptions enable row level security;
alter table public.subscription_checkouts enable row level security;
alter table public.subscription_payments enable row level security;

revoke all on public.platform_admins, public.business_subscriptions,
  public.subscription_checkouts, public.subscription_payments
  from anon, authenticated;
grant select, insert, update on public.business_subscriptions,
  public.subscription_checkouts, public.subscription_payments to service_role;
grant select, insert, delete on public.platform_admins to service_role;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = (select auth.uid())
  );
$$;

create or replace function public.get_platform_overview()
returns table (total_businesses bigint, subscribed_businesses bigint)
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
    (select count(*) from public.businesses),
    (select count(*)
      from public.business_subscriptions
      where status = 'active' and current_period_end > now());
end;
$$;

create or replace function public.get_business_subscription(p_business_id uuid)
returns table (
  provider text,
  billing_interval text,
  status text,
  current_period_end timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_business_member(p_business_id) then
    raise exception 'Business membership required';
  end if;

  return query
  select
    s.provider,
    s.billing_interval,
    case
      when s.status = 'active' and s.current_period_end <= now() then 'past_due'
      else s.status
    end,
    s.current_period_end
  from public.business_subscriptions s
  where s.business_id = p_business_id;
end;
$$;

-- Enforce exact 30-day monthly and 360-day annual subscription periods
create or replace function public.record_subscription_payment(
  p_checkout_id uuid,
  p_provider_reference text,
  p_amount_kes integer,
  p_paid_at timestamptz,
  p_provider_subscription_id text default null,
  p_provider_customer_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  checkout_record public.subscription_checkouts%rowtype;
  subscription_record public.business_subscriptions%rowtype;
  payment_business_id uuid;
  payment_interval text;
  period_start timestamptz;
  period_end timestamptz;
begin
  if p_provider_reference is null or p_amount_kes not in (500, 6000) then
    raise exception 'Invalid subscription payment';
  end if;

  if p_checkout_id is not null then
    select * into checkout_record
    from public.subscription_checkouts
    where id = p_checkout_id
    for update;

    if not found or checkout_record.amount_kes <> p_amount_kes then
      raise exception 'Subscription checkout not found or amount mismatch';
    end if;
    if checkout_record.status = 'succeeded' then
      return false;
    end if;
    if checkout_record.status <> 'pending' then
      raise exception 'Subscription checkout is not pending';
    end if;

    payment_business_id := checkout_record.business_id;
    payment_interval := checkout_record.billing_interval;

    select * into subscription_record
    from public.business_subscriptions
    where business_id = payment_business_id
    for update;

    period_start := case
      when found and subscription_record.current_period_end > p_paid_at
        then subscription_record.current_period_end
      else p_paid_at
    end;
    period_end := case payment_interval
      when 'monthly' then period_start + interval '30 days'
      else period_start + interval '360 days'
    end;

    insert into public.subscription_payments (
      business_id, provider, provider_reference, amount_kes, paid_at
    )
    values (
      payment_business_id, checkout_record.provider, p_provider_reference, p_amount_kes, p_paid_at
    )
    on conflict (provider, provider_reference) do nothing;

    if not found then
      return false;
    end if;

    update public.subscription_checkouts
    set status = 'succeeded', paid_at = p_paid_at
    where id = p_checkout_id;

    insert into public.business_subscriptions (
      business_id, provider, billing_interval, status, current_period_start,
      current_period_end, provider_subscription_id, provider_customer_id, updated_at
    )
    values (
      payment_business_id, checkout_record.provider, payment_interval, 'active',
      period_start, period_end, p_provider_subscription_id, p_provider_customer_id, now()
    )
    on conflict (business_id) do update
    set provider = excluded.provider,
        billing_interval = excluded.billing_interval,
        status = 'active',
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        provider_subscription_id = coalesce(
          excluded.provider_subscription_id,
          public.business_subscriptions.provider_subscription_id
        ),
        provider_customer_id = coalesce(
          excluded.provider_customer_id,
          public.business_subscriptions.provider_customer_id
        ),
        updated_at = now();

    return true;
  end if;

  select * into subscription_record
  from public.business_subscriptions
  where provider = 'paystack'
    and provider_subscription_id = p_provider_subscription_id
  for update;

  if not found then
    raise exception 'Paystack subscription not found';
  end if;
  payment_interval := subscription_record.billing_interval;
  if (payment_interval = 'monthly' and p_amount_kes <> 500)
    or (payment_interval = 'yearly' and p_amount_kes <> 6000) then
    raise exception 'Recurring payment amount does not match the subscription plan';
  end if;

  if exists (
    select 1 from public.subscription_payments
    where provider = 'paystack' and provider_reference = p_provider_reference
  ) then
    return false;
  end if;

  period_start := greatest(subscription_record.current_period_end, p_paid_at);
  period_end := case payment_interval
    when 'monthly' then period_start + interval '30 days'
    else period_start + interval '360 days'
  end;

  insert into public.subscription_payments (
    business_id, provider, provider_reference, amount_kes, paid_at
  )
  values (
    subscription_record.business_id, 'paystack', p_provider_reference, p_amount_kes, p_paid_at
  );

  update public.business_subscriptions
  set status = 'active',
      current_period_start = period_start,
      current_period_end = period_end,
      updated_at = now()
  where business_id = subscription_record.business_id;

  return true;
end;
$$;

-- Allow authenticated owners/admins to activate or renew a 30-day or 360-day Paystack subscription
create or replace function public.activate_business_subscription(
  p_business_id uuid,
  p_billing_interval text,
  p_provider_reference text,
  p_amount_kes integer
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  subscription_record public.business_subscriptions%rowtype;
  period_start timestamptz;
  period_end timestamptz;
begin
  if (select auth.uid()) is null
    or not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'Business owner or administrator access required';
  end if;

  if p_billing_interval not in ('monthly', 'yearly') then
    raise exception 'Invalid billing interval';
  end if;

  if p_provider_reference is null or char_length(btrim(p_provider_reference)) = 0 then
    raise exception 'Payment reference is required';
  end if;

  if (p_billing_interval = 'monthly' and p_amount_kes <> 500)
    or (p_billing_interval = 'yearly' and p_amount_kes <> 6000) then
    raise exception 'Payment amount does not match selected plan';
  end if;

  select * into subscription_record
  from public.business_subscriptions
  where business_id = p_business_id
  for update;

  period_start := case
    when found and subscription_record.status = 'active' and subscription_record.current_period_end > now()
      then subscription_record.current_period_end
    else now()
  end;

  period_end := case p_billing_interval
    when 'monthly' then period_start + interval '30 days'
    else period_start + interval '360 days'
  end;

  insert into public.subscription_payments (
    business_id, provider, provider_reference, amount_kes, paid_at
  )
  values (
    p_business_id, 'paystack', btrim(p_provider_reference), p_amount_kes, now()
  )
  on conflict (provider, provider_reference) do nothing;

  insert into public.business_subscriptions (
    business_id, provider, billing_interval, status, current_period_start,
    current_period_end, provider_subscription_id, updated_at
  )
  values (
    p_business_id, 'paystack', p_billing_interval, 'active',
    period_start, period_end, btrim(p_provider_reference), now()
  )
  on conflict (business_id) do update
  set provider = 'paystack',
      billing_interval = excluded.billing_interval,
      status = 'active',
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      provider_subscription_id = excluded.provider_subscription_id,
      updated_at = now();

  return period_end;
end;
$$;

revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.get_platform_overview() from public, anon;
revoke all on function public.get_business_subscription(uuid) from public, anon;
revoke all on function public.record_subscription_payment(
  uuid, text, integer, timestamptz, text, text
) from public, anon, authenticated;
revoke all on function public.activate_business_subscription(uuid, text, text, integer) from public, anon;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.get_platform_overview() to authenticated;
grant execute on function public.get_business_subscription(uuid) to authenticated;
grant execute on function public.record_subscription_payment(
  uuid, text, integer, timestamptz, text, text
) to service_role;
grant execute on function public.activate_business_subscription(uuid, text, text, integer) to authenticated;
