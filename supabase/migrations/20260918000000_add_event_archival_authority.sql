alter table public.tournaments
  add column if not exists archived_at timestamptz;

alter table public.qualifying_sessions
  add column if not exists archived_at timestamptz;

create index if not exists tournaments_owner_archive_idx
  on public.tournaments (owner_id, archived_at, tournament_date desc);

create index if not exists qualifying_sessions_owner_archive_idx
  on public.qualifying_sessions (owner_id, archived_at, created_at desc);

comment on column public.tournaments.archived_at is
  'Coach-facing visibility marker only. Archival does not delete or alter event scoring/history.';

comment on column public.qualifying_sessions.archived_at is
  'Coach-facing visibility marker only. Archival does not delete or alter event scoring/history.';

create or replace function public.manage_coach_event_archives(
  input_scope text,
  input_cutoff date,
  input_apply boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  coach_id uuid := public.current_coach_id();
  qualifying_candidate_ids uuid[] := '{}'::uuid[];
  tournament_candidate_ids uuid[] := '{}'::uuid[];
  archived_tournament_count integer := 0;
  archived_qualifying_count integer := 0;
  tournament_candidates jsonb;
  qualifying_candidates jsonb;
  safety_exclusions jsonb;
begin
  if coach_id is null then
    raise exception 'Coach authentication is required.' using errcode = '42501';
  end if;
  if input_scope not in ('tournaments', 'qualifying', 'both') then
    raise exception 'Archive scope is invalid.';
  end if;
  if input_cutoff is null or input_cutoff >= current_date then
    raise exception 'Archive cutoff must be a past date.';
  end if;

  if input_scope in ('qualifying', 'both') then
    select coalesce(array_agg(candidate.id), '{}'::uuid[])
    into qualifying_candidate_ids
    from (
      select session.id
      from public.qualifying_sessions session
      left join lateral (
        select min(day.play_date) as start_date, max(day.play_date) as end_date
        from public.qualifying_days day
        where day.qualifying_session_id = session.id
      ) dates on true
      where session.owner_id = coach_id
        and session.archived_at is null
        and dates.end_date is not null
        and dates.end_date < input_cutoff
        and (
          lower(session.status) in ('finalized', 'complete')
          or (
            lower(session.status) in ('draft', 'scheduled', 'provisioned')
            and not exists (
              select 1 from public.score_entries score
              where score.tournament_id = session.tournament_id
            )
          )
        )
    ) candidate;
  end if;

  if input_scope in ('tournaments', 'both') then
    select coalesce(array_agg(candidate.id), '{}'::uuid[])
    into tournament_candidate_ids
    from (
      select tournament.id
      from public.tournaments tournament
      where tournament.owner_id = coach_id
        and tournament.archived_at is null
        and coalesce(tournament.tournament_date, tournament.finalized_at::date) < input_cutoff
        and lower(tournament.status) in ('finalized', 'complete', 'completed', 'test', 'draft', 'upcoming', 'scheduled')
        and (
          lower(tournament.status) in ('finalized', 'complete', 'completed')
          or not exists (
            select 1 from public.score_entries score
            where score.tournament_id = tournament.id
              and lower(score.entry_status) not in ('submitted', 'verified', 'official')
          )
        )
        and not exists (
          select 1
          from public.qualifying_sessions session
          where session.tournament_id = tournament.id
            and session.archived_at is null
            and not (session.id = any(qualifying_candidate_ids))
        )
    ) candidate;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', tournament.id,
    'name', tournament.name,
    'eventDate', tournament.tournament_date,
    'status', tournament.status,
    'reason', case when lower(tournament.status) in ('finalized', 'complete', 'completed')
      then 'Completed before cutoff' else 'Inactive and scheduled before cutoff' end,
    'qualifyingSessionId', session.id
  ) order by tournament.tournament_date nulls last, tournament.name), '[]'::jsonb)
  into tournament_candidates
  from public.tournaments tournament
  left join public.qualifying_sessions session on session.tournament_id = tournament.id
  where tournament.id = any(tournament_candidate_ids);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', session.id,
    'name', session.name,
    'startDate', dates.start_date,
    'endDate', dates.end_date,
    'status', session.status,
    'reason', case when lower(session.status) in ('finalized', 'complete')
      then 'Completed before cutoff' else 'Inactive setup scheduled before cutoff' end,
    'backingTournamentId', session.tournament_id
  ) order by dates.end_date nulls last, session.name), '[]'::jsonb)
  into qualifying_candidates
  from public.qualifying_sessions session
  left join lateral (
    select min(day.play_date) as start_date, max(day.play_date) as end_date
    from public.qualifying_days day where day.qualifying_session_id = session.id
  ) dates on true
  where session.id = any(qualifying_candidate_ids);

  select coalesce(jsonb_agg(exclusion order by exclusion->>'eventDate', exclusion->>'name'), '[]'::jsonb)
  into safety_exclusions
  from (
    select jsonb_build_object(
      'eventType', 'qualifying', 'id', session.id, 'name', session.name,
      'eventDate', dates.end_date, 'status', session.status,
      'reason', case
        when lower(session.status) in ('active', 'provisioning', 'activating', 'finalizing') then 'Active workflow protected'
        when dates.end_date is null then 'No authoritative event date'
        when dates.end_date >= input_cutoff then 'Current, upcoming, or recent event protected'
        else 'Scoring or lifecycle state requires coach review'
      end,
      'backingTournamentId', session.tournament_id
    ) as exclusion
    from public.qualifying_sessions session
    left join lateral (
      select max(day.play_date) as end_date from public.qualifying_days day
      where day.qualifying_session_id = session.id
    ) dates on true
    where session.owner_id = coach_id
      and session.archived_at is null
      and not (session.id = any(qualifying_candidate_ids))
    union all
    select jsonb_build_object(
      'eventType', 'tournament', 'id', tournament.id, 'name', tournament.name,
      'eventDate', tournament.tournament_date, 'status', tournament.status,
      'reason', case
        when exists (
          select 1 from public.qualifying_sessions session
          where session.tournament_id = tournament.id
            and session.archived_at is null
            and not (session.id = any(qualifying_candidate_ids))
        ) then 'Backing Tournament for a protected Qualifying event'
        when tournament.tournament_date is null and tournament.finalized_at is null then 'No authoritative event date'
        when coalesce(tournament.tournament_date, tournament.finalized_at::date) >= input_cutoff then 'Current, upcoming, or recent event protected'
        else 'Active scoring or lifecycle state requires coach review'
      end,
      'backingTournamentId', null
    ) as exclusion
    from public.tournaments tournament
    where tournament.owner_id = coach_id
      and tournament.archived_at is null
      and not (tournament.id = any(tournament_candidate_ids))
  ) exclusions;

  if input_apply then
    if input_scope in ('qualifying', 'both') then
      update public.qualifying_sessions
      set archived_at = now(), updated_at = now()
      where owner_id = coach_id and archived_at is null and id = any(qualifying_candidate_ids);
      get diagnostics archived_qualifying_count = row_count;
    end if;
    if input_scope in ('tournaments', 'both') then
      update public.tournaments
      set archived_at = now(), updated_at = now()
      where owner_id = coach_id and archived_at is null and id = any(tournament_candidate_ids);
      get diagnostics archived_tournament_count = row_count;
    end if;
  end if;

  return jsonb_build_object(
    'cutoffDate', input_cutoff,
    'tournamentCandidates', tournament_candidates,
    'qualifyingCandidates', qualifying_candidates,
    'safetyExclusions', safety_exclusions,
    'archivedTournamentCount', archived_tournament_count,
    'archivedQualifyingCount', archived_qualifying_count
  );
end;
$$;

revoke all on function public.manage_coach_event_archives(text, date, boolean) from public;
grant execute on function public.manage_coach_event_archives(text, date, boolean) to authenticated;
