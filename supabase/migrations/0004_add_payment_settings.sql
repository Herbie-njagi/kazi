-- Add payment settings to businesses table
alter table public.businesses
  add column payment_method text check (payment_method in ('till', 'paybill', 'pochi', 'phone')),
  add column payment_identifier text;

-- Update existing businesses to have a default (optional)
update public.businesses set payment_method = 'till', payment_identifier = '000000' where payment_method is null;
