do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.provision_qualifying_session(uuid)'::regprocedure
  ) into function_definition;

  function_definition := replace(
    function_definition,
    quote_literal('draft'),
    quote_literal('draft') || '::text'
  );

  execute function_definition;
end;
$$;
