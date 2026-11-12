alter table public.businesses
  add column currency_code text not null default 'KES'
    check (currency_code = 'KES'),
  add column tax_rate numeric(5, 2) not null default 0
    check (tax_rate = 0);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  sku text,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  category text,
  price numeric(12, 2) not null check (price >= 0),
  stock_quantity numeric(12, 3) not null default 0 check (stock_quantity >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id)
);

create unique index products_business_sku_idx
  on public.products (business_id, lower(sku))
  where sku is not null and btrim(sku) <> '';
create index products_business_name_idx on public.products (business_id, name);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id)
);

create unique index customers_business_phone_idx
  on public.customers (business_id, phone)
  where phone is not null and btrim(phone) <> '';
create index customers_business_name_idx on public.customers (business_id, name);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  receipt_number text not null,
  customer_id uuid,
  created_by uuid not null references auth.users (id),
  status text not null default 'completed'
    check (status in ('completed', 'refunded')),
  payment_method text not null default 'mpesa'
    check (payment_method = 'mpesa'),
  mpesa_reference text,
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  tax numeric(12, 2) not null default 0 check (tax = 0),
  total numeric(12, 2) not null check (total >= 0),
  created_at timestamptz not null default now(),
  refunded_at timestamptz,
  unique (business_id, receipt_number),
  unique (id, business_id),
  foreign key (customer_id, business_id)
    references public.customers (id, business_id)
);

create index sales_business_created_idx
  on public.sales (business_id, created_at desc);
create index sales_business_status_idx on public.sales (business_id, status);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  sale_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  foreign key (sale_id, business_id)
    references public.sales (id, business_id),
  foreign key (product_id, business_id)
    references public.products (id, business_id)
);

create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (product_id);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid not null,
  movement_type text not null
    check (movement_type in ('adjustment', 'sale', 'refund')),
  quantity_delta numeric(12, 3) not null check (quantity_delta <> 0),
  reason text not null,
  sale_id uuid,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (product_id, business_id)
    references public.products (id, business_id),
  foreign key (sale_id, business_id)
    references public.sales (id, business_id)
);

create index inventory_movements_product_idx
  on public.inventory_movements (business_id, product_id, created_at desc);

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  opened_by uuid not null references auth.users (id),
  opened_at timestamptz not null default now(),
  opening_float numeric(12, 2) not null default 0 check (opening_float >= 0),
  closed_by uuid references auth.users (id),
  closed_at timestamptz,
  closing_count numeric(12, 2) check (closing_count >= 0),
  notes text,
  check (
    (closed_at is null and closed_by is null and closing_count is null)
    or (closed_at is not null and closed_by is not null and closing_count is not null)
  )
);

create unique index cash_sessions_one_open_per_business_idx
  on public.cash_sessions (business_id)
  where closed_at is null;
create index cash_sessions_business_opened_idx
  on public.cash_sessions (business_id, opened_at desc);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  session_id uuid not null references public.cash_sessions (id),
  movement_type text not null check (movement_type in ('paid_in', 'paid_out')),
  amount numeric(12, 2) not null check (amount > 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 240),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index cash_movements_session_idx
  on public.cash_movements (session_id, created_at);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create function public.has_business_role(p_business_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members
    where business_id = p_business_id
      and user_id = (select auth.uid())
      and role = any (p_roles)
  );
$$;

create function public.adjust_inventory(
  p_business_id uuid,
  p_product_id uuid,
  p_quantity_delta numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_quantity numeric(12, 3);
begin
  if (select auth.uid()) is null
    or not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'Business manager access required';
  end if;

  if p_quantity_delta is null or p_quantity_delta = 0 then
    raise exception 'Adjustment quantity must not be zero';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 240 then
    raise exception 'A reason of up to 240 characters is required';
  end if;

  select stock_quantity into current_quantity
  from public.products
  where id = p_product_id and business_id = p_business_id and is_active
  for update;

  if not found then
    raise exception 'Active product not found';
  end if;
  if current_quantity + p_quantity_delta < 0 then
    raise exception 'Adjustment would make stock negative';
  end if;

  update public.products
  set stock_quantity = stock_quantity + p_quantity_delta
  where id = p_product_id and business_id = p_business_id;

  insert into public.inventory_movements (
    business_id, product_id, movement_type, quantity_delta, reason, created_by
  )
  values (
    p_business_id, p_product_id, 'adjustment', p_quantity_delta,
    btrim(p_reason), (select auth.uid())
  );
end;
$$;

create function public.create_sale(
  p_business_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_mpesa_reference text default null
)
returns table (sale_id uuid, receipt_number text, sale_total numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_sale_id uuid := gen_random_uuid();
  new_receipt_number text;
  item jsonb;
  product_record record;
  item_quantity numeric(12, 3);
  item_total numeric(12, 2);
  running_total numeric(12, 2) := 0;
begin
  if current_user_id is null or not public.is_business_member(p_business_id) then
    raise exception 'Business membership required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Sale items must be provided as a list';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'A sale must contain at least one product';
  end if;
  if p_mpesa_reference is not null
    and char_length(btrim(p_mpesa_reference)) > 64 then
    raise exception 'M-Pesa reference must be 64 characters or fewer';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers
    where id = p_customer_id and business_id = p_business_id
  ) then
    raise exception 'Customer does not belong to this business';
  end if;

  new_receipt_number := 'KZ-' || to_char(now(), 'YYMMDD') || '-'
    || upper(right(replace(new_sale_id::text, '-', ''), 10));

  insert into public.sales (
    id, business_id, receipt_number, customer_id, created_by,
    mpesa_reference, subtotal, total
  )
  values (
    new_sale_id, p_business_id, new_receipt_number, p_customer_id,
    current_user_id, nullif(btrim(p_mpesa_reference), ''), 0, 0
  );

  for item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(item) <> 'object'
      or coalesce(item ->> 'product_id', '') = ''
      or coalesce(item ->> 'quantity', '') = '' then
      raise exception 'Each sale item needs a product and quantity';
    end if;

    begin
      item_quantity := (item ->> 'quantity')::numeric;
    exception when invalid_text_representation then
      raise exception 'Sale quantities must be numeric';
    end;

    if item_quantity <= 0 or item_quantity > 999999 then
      raise exception 'Sale quantity must be greater than zero';
    end if;

    select id, name, price, stock_quantity
    into product_record
    from public.products
    where id = (item ->> 'product_id')::uuid
      and business_id = p_business_id
      and is_active
    for update;

    if not found then
      raise exception 'A selected product is no longer available';
    end if;
    if product_record.stock_quantity < item_quantity then
      raise exception 'Insufficient stock for %', product_record.name;
    end if;

    item_total := round(product_record.price * item_quantity, 2);
    running_total := running_total + item_total;

    update public.products
    set stock_quantity = stock_quantity - item_quantity
    where id = product_record.id and business_id = p_business_id;

    insert into public.sale_items (
      business_id, sale_id, product_id, product_name, quantity, unit_price, line_total
    )
    values (
      p_business_id, new_sale_id, product_record.id, product_record.name,
      item_quantity, product_record.price, item_total
    );

    insert into public.inventory_movements (
      business_id, product_id, movement_type, quantity_delta, reason, sale_id, created_by
    )
    values (
      p_business_id, product_record.id, 'sale', -item_quantity,
      'Sale ' || new_receipt_number, new_sale_id, current_user_id
    );
  end loop;

  update public.sales
  set subtotal = running_total, total = running_total
  where id = new_sale_id and business_id = p_business_id;

  return query select new_sale_id, new_receipt_number, running_total;
end;
$$;

create function public.refund_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale_record public.sales%rowtype;
  item record;
begin
  select * into sale_record
  from public.sales
  where id = p_sale_id
  for update;

  if not found
    or not public.has_business_role(sale_record.business_id, array['owner', 'admin']) then
    raise exception 'Sale not found or manager access required';
  end if;
  if sale_record.status <> 'completed' then
    raise exception 'Only completed sales can be refunded';
  end if;

  update public.sales
  set status = 'refunded', refunded_at = now()
  where id = sale_record.id;

  for item in
    select product_id, product_name, quantity
    from public.sale_items
    where sale_id = sale_record.id
  loop
    update public.products
    set stock_quantity = stock_quantity + item.quantity
    where id = item.product_id and business_id = sale_record.business_id;

    insert into public.inventory_movements (
      business_id, product_id, movement_type, quantity_delta, reason, sale_id, created_by
    )
    values (
      sale_record.business_id, item.product_id, 'refund', item.quantity,
      'Refund ' || sale_record.receipt_number, sale_record.id, (select auth.uid())
    );
  end loop;
end;
$$;

create function public.open_cash_session(
  p_business_id uuid,
  p_opening_float numeric default 0,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_session_id uuid;
begin
  if (select auth.uid()) is null or not public.is_business_member(p_business_id) then
    raise exception 'Business membership required';
  end if;
  if p_opening_float is null or p_opening_float < 0 then
    raise exception 'Opening float must be zero or more';
  end if;

  insert into public.cash_sessions (business_id, opened_by, opening_float, notes)
  values (p_business_id, (select auth.uid()), p_opening_float, nullif(btrim(p_notes), ''))
  returning id into new_session_id;

  return new_session_id;
end;
$$;

create function public.close_cash_session(
  p_session_id uuid,
  p_closing_count numeric,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_business_id uuid;
  session_closed_at timestamptz;
begin
  select business_id, closed_at
  into session_business_id, session_closed_at
  from public.cash_sessions
  where id = p_session_id
  for update;

  if not found
    or not public.is_business_member(session_business_id) then
    raise exception 'Cash session not found or business membership required';
  end if;
  if session_closed_at is not null then
    raise exception 'Cash session is already closed';
  end if;
  if p_closing_count is null or p_closing_count < 0 then
    raise exception 'Closing count must be zero or more';
  end if;

  update public.cash_sessions
  set closed_by = (select auth.uid()),
      closed_at = now(),
      closing_count = p_closing_count,
      notes = coalesce(nullif(btrim(p_notes), ''), notes)
  where id = p_session_id;
end;
$$;

create function public.add_cash_movement(
  p_session_id uuid,
  p_movement_type text,
  p_amount numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_business_id uuid;
  session_opening_float numeric(12, 2);
  current_cash numeric(12, 2);
  new_movement_id uuid;
begin
  select business_id, opening_float
  into session_business_id, session_opening_float
  from public.cash_sessions
  where id = p_session_id and closed_at is null
  for update;

  if not found
    or not public.is_business_member(session_business_id) then
    raise exception 'Open cash session not found or business membership required';
  end if;
  if p_movement_type is null or p_movement_type not in ('paid_in', 'paid_out') then
    raise exception 'Movement type must be paid_in or paid_out';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 240 then
    raise exception 'A reason of up to 240 characters is required';
  end if;

  select session_opening_float + coalesce(sum(
    case when movement_type = 'paid_in' then amount else -amount end
  ), 0)
  into current_cash
  from public.cash_movements
  where session_id = p_session_id;

  if p_movement_type = 'paid_out' and p_amount > current_cash then
    raise exception 'Paid-out amount exceeds the available cash balance';
  end if;

  insert into public.cash_movements (
    business_id, session_id, movement_type, amount, reason, created_by
  )
  values (
    session_business_id, p_session_id, p_movement_type, p_amount,
    btrim(p_reason), (select auth.uid())
  )
  returning id into new_movement_id;

  return new_movement_id;
end;
$$;

alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;

revoke all on table public.products, public.customers, public.sales, public.sale_items,
  public.inventory_movements, public.cash_sessions, public.cash_movements
  from anon, authenticated;

grant select on public.products, public.sales, public.sale_items,
  public.inventory_movements, public.cash_sessions, public.cash_movements
  to authenticated;
grant insert (business_id, sku, name, category, price, is_active),
  update (sku, name, category, price, is_active) on public.products to authenticated;
grant insert (business_id, name, phone, email, notes),
  update (name, phone, email, notes) on public.customers to authenticated;
grant select on public.customers to authenticated;

create policy "Members can read products"
  on public.products for select to authenticated
  using (public.is_business_member(business_id));
create policy "Managers can create products"
  on public.products for insert to authenticated
  with check (public.has_business_role(business_id, array['owner', 'admin']));
create policy "Managers can update products"
  on public.products for update to authenticated
  using (public.has_business_role(business_id, array['owner', 'admin']))
  with check (public.has_business_role(business_id, array['owner', 'admin']));

create policy "Members can read customers"
  on public.customers for select to authenticated
  using (public.is_business_member(business_id));
create policy "Members can create customers"
  on public.customers for insert to authenticated
  with check (public.is_business_member(business_id));
create policy "Members can update customers"
  on public.customers for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "Members can read sales"
  on public.sales for select to authenticated
  using (public.is_business_member(business_id));
create policy "Members can read sale items"
  on public.sale_items for select to authenticated
  using (public.is_business_member(business_id));
create policy "Members can read inventory movements"
  on public.inventory_movements for select to authenticated
  using (public.is_business_member(business_id));
create policy "Members can read cash sessions"
  on public.cash_sessions for select to authenticated
  using (public.is_business_member(business_id));
create policy "Members can read cash movements"
  on public.cash_movements for select to authenticated
  using (public.is_business_member(business_id));

revoke all on function public.has_business_role(uuid, text[]) from public, anon, authenticated;
revoke all on function public.adjust_inventory(uuid, uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.create_sale(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.refund_sale(uuid) from public, anon, authenticated;
revoke all on function public.open_cash_session(uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.close_cash_session(uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.add_cash_movement(uuid, text, numeric, text) from public, anon, authenticated;

grant execute on function public.has_business_role(uuid, text[]) to authenticated;
grant execute on function public.adjust_inventory(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.create_sale(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.refund_sale(uuid) to authenticated;
grant execute on function public.open_cash_session(uuid, numeric, text) to authenticated;
grant execute on function public.close_cash_session(uuid, numeric, text) to authenticated;
grant execute on function public.add_cash_movement(uuid, text, numeric, text) to authenticated;
