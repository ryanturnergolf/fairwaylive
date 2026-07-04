alter table public.tournament_players
  add constraint tournament_players_tournament_round_player_key
  unique (tournament_id, round_number, player_id);
