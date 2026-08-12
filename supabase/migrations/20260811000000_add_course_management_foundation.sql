create table if not exists public.courses (
  id uuid primary key,
  name text not null unique,
  city text,
  state text,
  par integer not null check (par > 0),
  hole_count integer not null check (hole_count between 1 and 18),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.course_holes (
  course_id uuid not null references public.courses(id) on delete restrict,
  hole_number integer not null check (hole_number between 1 and 18),
  par integer not null check (par between 2 and 7),
  handicap_index integer not null check (handicap_index between 1 and 18),
  primary key (course_id, hole_number), unique (course_id, handicap_index)
);
create table if not exists public.course_tee_sets (
  id uuid primary key,
  course_id uuid not null references public.courses(id) on delete restrict,
  name text not null,
  color text not null,
  rating numeric(4,1),
  slope integer check (slope between 55 and 155),
  total_yardage integer not null check (total_yardage > 0),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, name)
);
create table if not exists public.course_tee_hole_yardages (
  tee_set_id uuid not null references public.course_tee_sets(id) on delete restrict,
  hole_number integer not null check (hole_number between 1 and 18),
  yardage integer not null check (yardage > 0),
  primary key (tee_set_id, hole_number)
);
create table if not exists public.saved_course_setups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.coaches(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 120),
  base_tee_set_id uuid references public.course_tee_sets(id) on delete restrict,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, course_id, name)
);
create table if not exists public.saved_course_setup_holes (
  setup_id uuid not null references public.saved_course_setups(id) on delete restrict,
  owner_id uuid not null references public.coaches(id) on delete restrict,
  hole_number integer not null check (hole_number between 1 and 18),
  yardage integer not null check (yardage > 0),
  source_tee_set_id uuid references public.course_tee_sets(id) on delete restrict,
  primary key (setup_id, hole_number)
);

alter table public.tournaments add column if not exists course_id uuid references public.courses(id) on delete set null;
alter table public.tournaments add column if not exists tee_set_id uuid references public.course_tee_sets(id) on delete set null;
alter table public.tournaments add column if not exists saved_course_setup_id uuid references public.saved_course_setups(id) on delete set null;
alter table public.tournaments add column if not exists course_setup_name text;
alter table public.tournaments add column if not exists course_hole_snapshot jsonb not null default '[]'::jsonb;
alter table public.qualifying_days add column if not exists course_id uuid references public.courses(id) on delete set null;
alter table public.qualifying_days add column if not exists tee_set_id uuid references public.course_tee_sets(id) on delete set null;
alter table public.qualifying_days add column if not exists saved_course_setup_id uuid references public.saved_course_setups(id) on delete set null;
alter table public.qualifying_days add column if not exists course_setup_name text;
alter table public.qualifying_days add column if not exists course_hole_snapshot jsonb not null default '[]'::jsonb;

create index if not exists saved_course_setups_owner_course_idx on public.saved_course_setups(owner_id, course_id);
create index if not exists course_tee_sets_course_idx on public.course_tee_sets(course_id);

create or replace function public.validate_saved_course_setup_owner() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.owner_id <> public.current_coach_id() then raise exception 'Saved setup owner is invalid.' using errcode='42501'; end if;
  if new.base_tee_set_id is not null and not exists(select 1 from public.course_tee_sets t where t.id=new.base_tee_set_id and t.course_id=new.course_id) then raise exception 'Base tee belongs to another course.'; end if;
  return new;
end $$;
create or replace function public.validate_saved_course_setup_hole_owner() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.owner_id <> public.current_coach_id() or not exists(select 1 from public.saved_course_setups s where s.id=new.setup_id and s.owner_id=new.owner_id) then raise exception 'Saved setup owner is invalid.' using errcode='42501'; end if;
  if new.source_tee_set_id is not null and not exists(select 1 from public.course_tee_sets t join public.saved_course_setups s on s.id=new.setup_id where t.id=new.source_tee_set_id and t.course_id=s.course_id) then raise exception 'Source tee belongs to another course.'; end if;
  return new;
end $$;
drop trigger if exists saved_course_setups_updated_at on public.saved_course_setups;
create trigger saved_course_setups_updated_at before update on public.saved_course_setups for each row execute function public.set_updated_at();
drop trigger if exists validate_saved_course_setup_owner_trigger on public.saved_course_setups;
create trigger validate_saved_course_setup_owner_trigger before insert or update on public.saved_course_setups for each row execute function public.validate_saved_course_setup_owner();
drop trigger if exists validate_saved_course_setup_hole_owner_trigger on public.saved_course_setup_holes;
create trigger validate_saved_course_setup_hole_owner_trigger before insert or update on public.saved_course_setup_holes for each row execute function public.validate_saved_course_setup_hole_owner();

alter table public.courses enable row level security;
alter table public.course_holes enable row level security;
alter table public.course_tee_sets enable row level security;
alter table public.course_tee_hole_yardages enable row level security;
alter table public.saved_course_setups enable row level security;
alter table public.saved_course_setup_holes enable row level security;
create policy "Authenticated coaches read courses" on public.courses for select to authenticated using (public.current_coach_id() is not null);
create policy "Authenticated coaches read course holes" on public.course_holes for select to authenticated using (public.current_coach_id() is not null);
create policy "Authenticated coaches read tee sets" on public.course_tee_sets for select to authenticated using (public.current_coach_id() is not null);
create policy "Authenticated coaches read tee yardages" on public.course_tee_hole_yardages for select to authenticated using (public.current_coach_id() is not null);
create policy "Coaches read own saved setups" on public.saved_course_setups for select to authenticated using (owner_id=public.current_coach_id());
create policy "Coaches insert own saved setups" on public.saved_course_setups for insert to authenticated with check (owner_id=public.current_coach_id());
create policy "Coaches update own saved setups" on public.saved_course_setups for update to authenticated using (owner_id=public.current_coach_id()) with check (owner_id=public.current_coach_id());
create policy "Coaches read own saved setup holes" on public.saved_course_setup_holes for select to authenticated using (owner_id=public.current_coach_id());
create policy "Coaches insert own saved setup holes" on public.saved_course_setup_holes for insert to authenticated with check (owner_id=public.current_coach_id());
create policy "Coaches update own saved setup holes" on public.saved_course_setup_holes for update to authenticated using (owner_id=public.current_coach_id()) with check (owner_id=public.current_coach_id());

insert into public.courses(id,name,city,state,par,hole_count) values
('11111111-1111-4111-8111-111111111101','Hidden Creek Golf Club',null,null,72,18),
('11111111-1111-4111-8111-111111111102','Bluffton Golf Club','Bluffton','Ohio',72,18)
on conflict(id) do update set name=excluded.name,city=excluded.city,state=excluded.state,par=excluded.par,hole_count=excluded.hole_count;

insert into public.course_holes(course_id,hole_number,par,handicap_index)
select '11111111-1111-4111-8111-111111111101'::uuid,n,p,h from unnest(
array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18],array[4,3,4,5,4,3,4,5,4,5,4,4,4,4,3,5,4,3],array[10,6,14,8,2,18,16,4,12,13,7,3,11,1,17,9,15,5]) as x(n,p,h)
on conflict(course_id,hole_number) do update set par=excluded.par,handicap_index=excluded.handicap_index;
insert into public.course_holes(course_id,hole_number,par,handicap_index)
select '11111111-1111-4111-8111-111111111102'::uuid,n,p,h from unnest(
array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18],array[4,5,5,3,4,4,4,4,3,4,4,4,5,3,4,5,3,4],array[18,14,16,12,6,10,2,4,8,17,3,1,9,7,5,13,11,15]) as x(n,p,h)
on conflict(course_id,hole_number) do update set par=excluded.par,handicap_index=excluded.handicap_index;

insert into public.course_tee_sets(id,course_id,name,color,rating,slope,total_yardage,display_order) values
('22222222-2222-4222-8222-222222222101','11111111-1111-4111-8111-111111111101','Black','Black',null,null,6810,1),
('22222222-2222-4222-8222-222222222102','11111111-1111-4111-8111-111111111101','Green','Green',null,null,6310,2),
('22222222-2222-4222-8222-222222222103','11111111-1111-4111-8111-111111111101','Brown','Brown',null,null,5475,3),
('22222222-2222-4222-8222-222222222104','11111111-1111-4111-8111-111111111101','Red','Red',null,null,4860,4),
('22222222-2222-4222-8222-222222222201','11111111-1111-4111-8111-111111111102','Black','Black',72.0,129,6616,1),
('22222222-2222-4222-8222-222222222202','11111111-1111-4111-8111-111111111102','White','White',69.0,118,6148,2),
('22222222-2222-4222-8222-222222222203','11111111-1111-4111-8111-111111111102','Silver','Silver',67.2,114,5735,3),
('22222222-2222-4222-8222-222222222204','11111111-1111-4111-8111-111111111102','Yellow','Yellow',65.0,109,5267,4),
('22222222-2222-4222-8222-222222222205','11111111-1111-4111-8111-111111111102','Red','Red',61.6,99,4490,5)
on conflict(id) do update set name=excluded.name,color=excluded.color,rating=excluded.rating,slope=excluded.slope,total_yardage=excluded.total_yardage,display_order=excluded.display_order;

with tee_data(id,yards) as (values
('22222222-2222-4222-8222-222222222101'::uuid,array[395,200,380,485,465,170,400,515,365,490,410,435,410,415,140,530,365,240]),
('22222222-2222-4222-8222-222222222102'::uuid,array[370,180,355,470,390,145,345,500,350,475,380,385,390,400,130,505,350,190]),
('22222222-2222-4222-8222-222222222103'::uuid,array[310,130,295,400,300,135,330,440,310,405,330,370,360,340,120,445,295,160]),
('22222222-2222-4222-8222-222222222104'::uuid,array[285,110,255,380,290,100,305,415,280,375,290,300,280,320,70,410,260,135]),
('22222222-2222-4222-8222-222222222201'::uuid,array[295,520,518,192,350,375,428,388,190,350,415,480,500,177,420,530,168,320]),
('22222222-2222-4222-8222-222222222202'::uuid,array[275,502,472,168,325,356,404,353,175,335,370,440,455,165,392,505,150,306]),
('22222222-2222-4222-8222-222222222203'::uuid,array[255,475,450,152,291,340,368,330,165,320,320,413,410,153,380,485,138,290]),
('22222222-2222-4222-8222-222222222204'::uuid,array[240,445,425,138,270,302,335,310,152,305,285,380,370,137,310,465,128,270]),
('22222222-2222-4222-8222-222222222205'::uuid,array[215,422,335,119,216,240,301,263,131,230,240,315,325,125,265,375,118,255])
)
insert into public.course_tee_hole_yardages(tee_set_id,hole_number,yardage)
select id,ordinality,yardage from tee_data cross join lateral unnest(yards) with ordinality y(yardage,ordinality)
on conflict(tee_set_id,hole_number) do update set yardage=excluded.yardage;

create or replace function public.validate_course_setup_reference() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.course_id is null then return new; end if;
  if new.tee_set_id is not null and not exists(select 1 from public.course_tee_sets t where t.id=new.tee_set_id and t.course_id=new.course_id) then raise exception 'Tee set belongs to another course.'; end if;
  if new.saved_course_setup_id is not null and not exists(select 1 from public.saved_course_setups s where s.id=new.saved_course_setup_id and s.course_id=new.course_id and s.owner_id=public.current_coach_id()) then raise exception 'Saved setup is unavailable.' using errcode='42501'; end if;
  if jsonb_typeof(new.course_hole_snapshot) <> 'array' then raise exception 'Course hole snapshot must be an array.'; end if;
  return new;
end $$;
drop trigger if exists validate_tournament_course_setup_trigger on public.tournaments;
create trigger validate_tournament_course_setup_trigger before insert or update of course_id,tee_set_id,saved_course_setup_id,course_hole_snapshot on public.tournaments for each row execute function public.validate_course_setup_reference();
drop trigger if exists validate_qualifying_day_course_setup_trigger on public.qualifying_days;
create trigger validate_qualifying_day_course_setup_trigger before insert or update of course_id,tee_set_id,saved_course_setup_id,course_hole_snapshot on public.qualifying_days for each row execute function public.validate_course_setup_reference();

create or replace function public.apply_qualifying_course_snapshots(input_session_id uuid, input_days jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare day_value jsonb;
begin
  if not exists(select 1 from public.qualifying_sessions where id=input_session_id and owner_id=public.current_coach_id() and status='draft') then raise exception 'Qualifying draft is unavailable.' using errcode='42501'; end if;
  for day_value in select value from jsonb_array_elements(input_days) loop
    if day_value ? 'courseSetup' and jsonb_typeof(day_value->'courseSetup')='object' then
      update public.qualifying_days set
        course_id=nullif(day_value->'courseSetup'->>'courseId','')::uuid,
        tee_set_id=nullif(day_value->'courseSetup'->>'teeSetId','')::uuid,
        saved_course_setup_id=nullif(day_value->'courseSetup'->>'savedSetupId','')::uuid,
        course_setup_name=nullif(trim(day_value->'courseSetup'->>'setupName'),''),
        course_hole_snapshot=coalesce(day_value->'courseSetup'->'holes','[]'::jsonb)
      where qualifying_session_id=input_session_id and day_number=(day_value->>'dayNumber')::integer;
    end if;
  end loop;
end $$;
revoke all on function public.apply_qualifying_course_snapshots(uuid,jsonb) from public,anon;
grant execute on function public.apply_qualifying_course_snapshots(uuid,jsonb) to authenticated;

create or replace function public.snapshot_qualifying_course_to_tournament() returns trigger language plpgsql security invoker set search_path=public as $$
declare first_day public.qualifying_days%rowtype;
begin
  if new.tournament_id is null or new.tournament_id is not distinct from old.tournament_id then return new; end if;
  select * into first_day from public.qualifying_days where qualifying_session_id=new.id order by day_number limit 1;
  if first_day.course_id is not null then
    update public.tournaments set course=first_day.course_name, course_id=first_day.course_id, tee_set_id=first_day.tee_set_id,
      saved_course_setup_id=first_day.saved_course_setup_id, course_setup_name=first_day.course_setup_name,
      course_hole_snapshot=first_day.course_hole_snapshot
    where id=new.tournament_id and owner_id=new.owner_id;
  end if;
  return new;
end $$;
drop trigger if exists snapshot_qualifying_course_to_tournament_trigger on public.qualifying_sessions;
create trigger snapshot_qualifying_course_to_tournament_trigger after update of tournament_id on public.qualifying_sessions for each row execute function public.snapshot_qualifying_course_to_tournament();
