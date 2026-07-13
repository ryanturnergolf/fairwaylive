-- Migration: fix_coach_auth_policy_and_constraint
--
-- Corrects two issues left after 20260712000000_establish_coach_auth_foundation.sql:
--
-- 1. The "Coaches can create owned tournaments" INSERT policy created by the
--    establish migration included an additional EXISTS (SELECT 1 FROM coaches ...)
--    sub-clause that caused PostgREST to reject inserts for valid coach sessions
--    (the sub-clause conflicted with the RLS evaluation order of the AFTER trigger
--    that auto-creates the membership row). The policy is replaced with the simpler
--    definition: owner_id = current_coach_id().
--
-- 2. The unique constraint on tournament_players defined in migration
--    20260703000000_add_tournament_players_upsert_key.sql was never applied to the
--    live database (that migration was marked applied via migration repair without
--    executing the SQL). The constraint is added here idempotently.

-- 1. Fix the tournaments INSERT policy
drop policy if exists "Coaches can create owned tournaments" on public.tournaments;
create policy "Coaches can create owned tournaments"
  on public.tournaments for insert to anon, authenticated
  with check (owner_id = public.current_coach_id());

-- 2. Add tournament_players unique constraint (idempotent guard)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tournament_players_tournament_round_player_key'
      and conrelid = 'public.tournament_players'::regclass
  ) then
    alter table public.tournament_players
      add constraint tournament_players_tournament_round_player_key
      unique (tournament_id, round_number, player_id);
  end if;
end $$;
