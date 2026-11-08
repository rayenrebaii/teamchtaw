create type public.app_role as enum ('admin','user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  email text not null default '',
  school text not null default '',
  phone text not null default '',
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
grant select on public.profiles to authenticated;
grant update (approved) on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admin approves" on public.profiles for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.app_config (
  id int primary key default 1,
  download_url text not null,
  constraint single_row check (id = 1)
);
grant select on public.app_config to authenticated;
grant all on public.app_config to service_role;
alter table public.app_config enable row level security;
create policy "approved users read link" on public.app_config for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved) or public.has_role(auth.uid(),'admin'));
insert into public.app_config (id, download_url) values (1, 'https://example.com/telecharger-app');

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, first_name, last_name, email, school, phone)
  values (new.id,
    coalesce(new.raw_user_meta_data->>'first_name',''),
    coalesce(new.raw_user_meta_data->>'last_name',''),
    coalesce(new.email,''),
    coalesce(new.raw_user_meta_data->>'school',''),
    coalesce(new.raw_user_meta_data->>'phone',''));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();