-- Add customer_phone to sales table
alter table public.sales
  add column customer_phone text;

-- Update create_sale RPC
drop function public.create_sale(uuid, uuid, jsonb, text);

create function public.create_sale(
  p_business_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_mpesa_reference text default null,
  p_customer_phone text default null
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
    mpesa_reference, customer_phone, subtotal, total
  )
  values (
    new_sale_id, p_business_id, new_receipt_number, p_customer_id,
    current_user_id, nullif(btrim(p_mpesa_reference), ''), nullif(btrim(p_customer_phone), ''), 0, 0
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
