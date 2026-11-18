-- FinFamily cloud schema for Supabase
create extension if not exists pgcrypto;

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(8),'hex'),1,8)),
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  unique (family_id, user_id)
);

create table if not exists public.operations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  member_name text not null,
  title text not null,
  kind text not null check (kind in ('income','mandatory','shared','personal')),
  amount numeric(14,2) not null check (amount > 0),
  operation_date date not null,
  settled boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.is_family_member(target_family uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.family_members
  where user_id = auth.uid() and family_id = target_family
); $$;

create or replace function public.create_family(family_name_input text, member_name_input text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_family uuid;
begin
  if auth.uid() is null then raise exception 'Требуется авторизация'; end if;
  if exists(select 1 from public.family_members where user_id=auth.uid()) then
    raise exception 'У этого аккаунта уже есть семейный профиль';
  end if;
  insert into public.families(name) values (coalesce(nullif(trim(family_name_input),''),'Наша семья'))
  returning id into new_family;
  insert into public.family_members(user_id,family_id,display_name)
  values(auth.uid(),new_family,trim(member_name_input));
  return new_family;
end; $$;

create or replace function public.join_family_by_code(invite_code_input text, member_name_input text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare target_family uuid; member_count integer;
begin
  if auth.uid() is null then raise exception 'Требуется авторизация'; end if;
  if exists(select 1 from public.family_members where user_id=auth.uid()) then
    raise exception 'У этого аккаунта уже есть семейный профиль';
  end if;
  select id into target_family from public.families
  where invite_code=upper(trim(invite_code_input));
  if target_family is null then raise exception 'Код семьи не найден'; end if;
  select count(*) into member_count from public.family_members where family_id=target_family;
  if member_count >= 2 then raise exception 'В семье уже зарегистрированы два участника'; end if;
  insert into public.family_members(user_id,family_id,display_name)
  values(auth.uid(),target_family,trim(member_name_input));
  return target_family;
end; $$;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.operations enable row level security;

create policy "family members can read their family"
on public.families for select to authenticated
using (public.is_family_member(id));

create policy "members can read family members"
on public.family_members for select to authenticated
using (public.is_family_member(family_id));

create policy "members can read family operations"
on public.operations for select to authenticated
using (public.is_family_member(family_id));

create policy "members can add family operations"
on public.operations for insert to authenticated
with check (
  public.is_family_member(family_id)
  and created_by = auth.uid()
);

create policy "members can update family operations"
on public.operations for update to authenticated
using (public.is_family_member(family_id))
with check (public.is_family_member(family_id));

create policy "members can delete family operations"
on public.operations for delete to authenticated
using (public.is_family_member(family_id));

grant execute on function public.create_family(text,text) to authenticated;
grant execute on function public.join_family_by_code(text,text) to authenticated;
grant execute on function public.is_family_member(uuid) to authenticated;

-- Enable Realtime for synchronized changes on both phones.
alter publication supabase_realtime add table public.operations;
