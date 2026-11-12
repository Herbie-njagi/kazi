create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'staff')),
  joined_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create index business_members_user_id_idx on public.business_members (user_id);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

create function public.is_business_member(p_business_id uuid)
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
  );
$$;

create function public.create_business(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_business_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 120 then
    raise exception 'Business name must be between 1 and 120 characters';
  end if;

  insert into public.businesses (name)
  values (btrim(p_name))
  returning id into new_business_id;

  insert into public.business_members (business_id, user_id, role)
  values (new_business_id, (select auth.uid()), 'owner');

  return new_business_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;

revoke all on table public.profiles, public.businesses, public.business_members
  from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select on table public.businesses to authenticated;
grant update (name) on table public.businesses to authenticated;
grant select on table public.business_members to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Members can read their businesses"
  on public.businesses for select to authenticated
  using (public.is_business_member(id));

create policy "Owners and admins can update their businesses"
  on public.businesses for update to authenticated
  using (
    exists (
      select 1
      from public.business_members
      where business_id = id
        and user_id = (select auth.uid())
        and role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.business_members
      where business_id = id
        and user_id = (select auth.uid())
        and role in ('owner', 'admin')
    )
  );

create policy "Members can read their business memberships"
  on public.business_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_business_member(business_id)
  );

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.is_business_member(uuid) from public, anon, authenticated;
revoke all on function public.create_business(text) from public, anon, authenticated;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.create_business(text) to authenticated;
