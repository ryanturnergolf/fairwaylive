create or replace function public.ensure_tournament_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.tournament_memberships (tournament_id, coach_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (tournament_id, coach_id, role) do nothing;
  return new;
end;
$$;

alter function public.ensure_tournament_owner_membership() owner to postgres;
revoke all on function public.ensure_tournament_owner_membership() from public, anon, authenticated;

create or replace function public.create_coach_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.is_anonymous is true then
    return new;
  end if;

  insert into public.coaches (id, display_name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update
  set email = excluded.email,
      updated_at = now();
  return new;
end;
$$;

alter function public.create_coach_profile_for_auth_user() owner to postgres;
revoke all on function public.create_coach_profile_for_auth_user() from public, anon, authenticated;

drop trigger if exists create_coach_profile_for_auth_user on auth.users;
create trigger create_coach_profile_for_auth_user
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.create_coach_profile_for_auth_user();

insert into public.coaches (id, display_name, email)
select
  users.id,
  coalesce(nullif(users.raw_user_meta_data ->> 'display_name', ''), split_part(users.email, '@', 1)),
  users.email
from auth.users users
where users.is_anonymous is not true
on conflict (id) do update
set email = excluded.email,
    updated_at = now();

drop policy if exists "Coaches can create owned tournaments" on public.tournaments;
create policy "Coaches can create owned tournaments"
  on public.tournaments for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.coaches coach where coach.id = auth.uid())
  );

drop policy if exists "Owners and admins can update tournaments" on public.tournaments;
create policy "Owners and admins can update tournaments"
  on public.tournaments for update to authenticated
  using (public.has_tournament_role(id, array['owner', 'admin']))
  with check (owner_id = auth.uid() or public.has_tournament_role(id, array['owner', 'admin']));

drop policy if exists "Owners and admins can manage memberships" on public.tournament_memberships;
create policy "Owners and admins can manage memberships"
  on public.tournament_memberships for all to authenticated
  using (public.has_tournament_role(tournament_id, array['owner', 'admin']))
  with check (public.has_tournament_role(tournament_id, array['owner', 'admin']));

drop policy if exists "Coaches can read their own coach identity" on public.coaches;
create policy "Coaches can read their own coach identity"
  on public.coaches for select to authenticated
  using (id = auth.uid());
