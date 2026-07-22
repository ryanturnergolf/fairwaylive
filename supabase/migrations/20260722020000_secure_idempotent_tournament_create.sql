alter function public.ensure_tournament_owner_membership() security definer;
alter function public.ensure_tournament_owner_membership() set search_path = public;

alter function public.create_tournament_idempotent(text, text, text, date, integer, text)
  set row_security = off;
