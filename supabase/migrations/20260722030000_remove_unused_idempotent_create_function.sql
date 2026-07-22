revoke all on function public.create_tournament_idempotent(text, text, text, date, integer, text) from authenticated;
drop function if exists public.create_tournament_idempotent(text, text, text, date, integer, text);

alter function public.ensure_tournament_owner_membership() security invoker;
alter function public.ensure_tournament_owner_membership() reset search_path;
