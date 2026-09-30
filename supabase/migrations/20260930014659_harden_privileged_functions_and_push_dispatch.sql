begin;

-- Claim push jobs atomically so overlapping cron runs cannot send the same
-- notification twice. Rows left in progress are eligible for recovery after
-- ten minutes.
alter table public.push_fila
  add column if not exists processando_em timestamptz;

create index if not exists push_fila_dispatch_idx
  on public.push_fila (status, created_at)
  where status in ('pendente', 'enviando') and tentativas < 5;

create index if not exists push_fila_user_id_idx
  on public.push_fila (user_id);

-- Only secure-login (service_role) maintains the throttling state. RLS already
-- blocks browser access; the explicit revoke adds a second boundary.
revoke all on table public.login_tentativas from anon, authenticated;

create or replace function public.claim_push_fila(p_limit integer default 50)
returns setof public.push_fila
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select f.id
    from public.push_fila as f
    where f.tentativas < 5
      and (
        f.status = 'pendente'
        or (
          f.status = 'enviando'
          and f.processando_em < now() - interval '10 minutes'
        )
      )
    order by f.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
  )
  update public.push_fila as f
  set status = 'enviando',
      tentativas = f.tentativas + 1,
      processando_em = now()
  from candidates
  where f.id = candidates.id
  returning f.*;
end;
$$;

revoke all on function public.claim_push_fila(integer) from public, anon, authenticated;
grant execute on function public.claim_push_fila(integer) to service_role;

-- Trigger-only functions are not public RPC endpoints.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'enfileirar_push_alerta',
        'registrar_auditoria',
        'sincronizar_cobranca_financeiro',
        'sincronizar_repasse_financeiro'
      )
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      fn.signature
    );
  end loop;
end;
$$;

-- These helpers are required by authenticated RLS policies or perform an
-- explicit administrator check in their body. Anonymous execution is removed.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'is_admin',
        'meu_inquilino_id',
        'meu_proprietario_id',
        'usuario_pode_ver_contrato',
        'usuario_pode_ver_imovel',
        'gerar_alertas_operacionais',
        'gerar_cobrancas_mes',
        'gerar_repasses_mes'
      )
  loop
    execute format('revoke execute on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to authenticated', fn.signature);
  end loop;
end;
$$;

-- System-only entry points retain only the role that actually invokes them.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'gerar_alertas_operacionais_sistema'
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      fn.signature
    );
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;

  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'handle_new_auth_user'
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      fn.signature
    );
    execute format('grant execute on function %s to supabase_auth_admin', fn.signature);
  end loop;
end;
$$;

-- Policies that were implicitly created for PUBLIC are intended only for
-- signed-in application users.
do $$
declare
  policy_ref record;
begin
  for policy_ref in
    select *
    from (values
      ('public', 'alertas', 'alertas_admin_all'),
      ('public', 'alertas', 'alertas_vinculados_select'),
      ('public', 'documentos', 'documentos_admin_all'),
      ('public', 'push_dispositivos', 'usuario atualiza seus dispositivos'),
      ('public', 'push_dispositivos', 'usuario cadastra seus dispositivos'),
      ('public', 'push_dispositivos', 'usuario consulta seus dispositivos'),
      ('public', 'push_dispositivos', 'usuario remove seus dispositivos'),
      ('public', 'push_fila', 'usuario consulta sua fila push'),
      ('public', 'vistoria_itens', 'vistoria_itens_admin_all'),
      ('public', 'vistoria_itens', 'vistoria_itens_select_vinculado'),
      ('public', 'vistorias', 'vistorias_admin_all')
    ) as policies(schema_name, table_name, policy_name)
  loop
    if exists (
      select 1
      from pg_policies
      where schemaname = policy_ref.schema_name
        and tablename = policy_ref.table_name
        and policyname = policy_ref.policy_name
    ) then
      execute format(
        'alter policy %I on %I.%I to authenticated',
        policy_ref.policy_name,
        policy_ref.schema_name,
        policy_ref.table_name
      );
    end if;
  end loop;
end;
$$;

-- The secret value is provisioned separately in Supabase Vault and as the
-- PUSH_DISPATCH_SECRET Edge Function secret. No request is made if Vault has
-- not been configured yet.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'matos_push_dispatch') then
    perform cron.unschedule('matos_push_dispatch');
  end if;

  if to_regclass('vault.secrets') is not null then
    perform cron.schedule(
      'matos_push_dispatch',
      '*/2 * * * *',
      $job$
      select net.http_post(
        url := 'https://behmmbgbrsesxthsczdl.supabase.co/functions/v1/push-dispatch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-push-dispatch-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'push_dispatch_secret'
            limit 1
          )
        ),
        body := '{}'::jsonb
      )
      where exists (
        select 1
        from vault.decrypted_secrets
        where name = 'push_dispatch_secret'
      );
      $job$
    );
  end if;
end;
$$;

commit;
