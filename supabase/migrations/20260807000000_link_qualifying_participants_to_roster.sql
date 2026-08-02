alter function public.create_qualifying_session_draft(text, text, text, jsonb, jsonb, jsonb)
  rename to create_qualifying_session_draft_without_roster_links;

create function public.create_qualifying_session_draft(
  input_name text,
  input_roster_type text,
  input_scoring_mode text,
  input_selected_players jsonb,
  input_groups jsonb,
  input_days jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  coach_id uuid := public.current_coach_id();
  session_id uuid;
begin
  if exists (
    select 1
    from jsonb_array_elements(input_selected_players) player
    where nullif(player ->> 'rosterPlayerId', '') is not null
      and (
        (player ->> 'rosterPlayerId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or not exists (
          select 1
          from public.roster_players roster_player
          where roster_player.id::text = lower(player ->> 'rosterPlayerId')
            and roster_player.owner_id = coach_id
            and roster_player.archived_at is null
        )
      )
  ) then
    raise exception 'A selected roster player is invalid or unavailable.' using errcode = '42501';
  end if;

  session_id := public.create_qualifying_session_draft_without_roster_links(
    input_name,
    input_roster_type,
    input_scoring_mode,
    input_selected_players,
    input_groups,
    input_days
  );

  update public.qualifying_participants participant
  set roster_player_id = (player.player_data ->> 'rosterPlayerId')::uuid
  from jsonb_array_elements(input_selected_players) player(player_data)
  where participant.qualifying_session_id = session_id
    and participant.player_id = player.player_data ->> 'id'
    and nullif(player.player_data ->> 'rosterPlayerId', '') is not null;

  return session_id;
end;
$$;

create or replace function public.sync_tournament_players_from_qualifying(
  input_tournament_id uuid,
  input_qualifying_session_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  synchronized_count integer;
begin
  if not exists (
    select 1
    from public.qualifying_sessions session
    where session.id = input_qualifying_session_id
      and session.tournament_id = input_tournament_id
      and session.owner_id = public.current_coach_id()
  ) then
    raise exception 'Qualifying session is not authorized for player synchronization.'
      using errcode = '42501';
  end if;

  insert into public.tournament_players (
    tournament_id,
    roster_player_id,
    player_id,
    player_name,
    team_id,
    team_name,
    round_number,
    group_number,
    tee_number,
    starting_hole,
    marker_player_id,
    is_individual,
    position,
    status
  )
  select
    input_tournament_id,
    participant.roster_player_id,
    participant.player_id,
    participant.player_name,
    null,
    null,
    tournament_round.round_number,
    null,
    null,
    null,
    null,
    true,
    participant.display_order + 1,
    'active'
  from public.qualifying_participants participant
  cross join public.tournament_rounds tournament_round
  where participant.qualifying_session_id = input_qualifying_session_id
    and tournament_round.qualifying_session_id = input_qualifying_session_id
    and tournament_round.tournament_id = input_tournament_id
  order by tournament_round.round_number, participant.display_order
  on conflict (tournament_id, round_number, player_id) do update
    set roster_player_id = excluded.roster_player_id,
        player_name = excluded.player_name,
        team_id = excluded.team_id,
        team_name = excluded.team_name,
        group_number = excluded.group_number,
        tee_number = excluded.tee_number,
        starting_hole = excluded.starting_hole,
        marker_player_id = excluded.marker_player_id,
        is_individual = excluded.is_individual,
        position = excluded.position,
        status = excluded.status;

  select count(*) into synchronized_count
  from public.tournament_players player
  where player.tournament_id = input_tournament_id
    and exists (
      select 1
      from public.qualifying_participants participant
      where participant.qualifying_session_id = input_qualifying_session_id
        and participant.player_id = player.player_id
    )
    and exists (
      select 1
      from public.tournament_rounds tournament_round
      where tournament_round.qualifying_session_id = input_qualifying_session_id
        and tournament_round.tournament_id = input_tournament_id
        and tournament_round.round_number = player.round_number
    );

  return synchronized_count;
end;
$$;

revoke all on function public.create_qualifying_session_draft_without_roster_links(
  text, text, text, jsonb, jsonb, jsonb
) from public;
grant execute on function public.create_qualifying_session_draft_without_roster_links(
  text, text, text, jsonb, jsonb, jsonb
) to authenticated;
revoke all on function public.create_qualifying_session_draft(
  text, text, text, jsonb, jsonb, jsonb
) from public;
grant execute on function public.create_qualifying_session_draft(
  text, text, text, jsonb, jsonb, jsonb
) to authenticated;
