create extension if not exists pgcrypto;

alter table public.financeiro add column if not exists cobranca_id uuid references public.cobrancas(id) on delete set null;
create unique index if not exists financeiro_cobranca_unica on public.financeiro(cobranca_id) where cobranca_id is not null;
create unique index if not exists cobrancas_contrato_competencia_unica on public.cobrancas(contrato_id, competencia) where contrato_id is not null;

create table if not exists public.auditoria (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id uuid,
  acao text not null,
  usuario_id uuid default auth.uid(),
  dados_anteriores jsonb,
  dados_novos jsonb,
  criado_em timestamptz not null default now()
);
alter table public.auditoria enable row level security;
drop policy if exists auditoria_admin_select on public.auditoria;
create policy auditoria_admin_select on public.auditoria for select to authenticated using (public.is_admin());

create or replace function public.registrar_auditoria() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    insert into public.auditoria(tabela,registro_id,acao,dados_novos) values(tg_table_name,new.id,'CRIAR',to_jsonb(new));
    return new;
  elsif tg_op='UPDATE' then
    insert into public.auditoria(tabela,registro_id,acao,dados_anteriores,dados_novos) values(tg_table_name,new.id,'ALTERAR',to_jsonb(old),to_jsonb(new));
    return new;
  else
    insert into public.auditoria(tabela,registro_id,acao,dados_anteriores) values(tg_table_name,old.id,'EXCLUIR',to_jsonb(old));
    return old;
  end if;
end $$;

do $$ declare t text; begin
  foreach t in array array['imoveis','proprietarios','inquilinos','contratos','cobrancas','financeiro','iptu','manutencoes'] loop
    execute format('drop trigger if exists trg_auditoria_%I on public.%I',t,t);
    execute format('create trigger trg_auditoria_%I after insert or update or delete on public.%I for each row execute function public.registrar_auditoria()',t,t);
  end loop;
end $$;

create or replace function public.gerar_cobrancas_mes(p_mes date default date_trunc('month',current_date)::date)
returns integer language plpgsql security definer set search_path=public as $$
declare c record; n integer:=0; comp date:=date_trunc('month',p_mes)::date; venc date; ultimo_dia integer;
begin
  if not public.is_admin() then raise exception 'Apenas administradores podem gerar cobranças'; end if;
  ultimo_dia:=extract(day from (comp + interval '1 month - 1 day'))::integer;
  for c in select * from public.contratos where status='ativo' and data_inicio <= (comp + interval '1 month - 1 day')::date and data_fim >= comp loop
    venc:=make_date(extract(year from comp)::int,extract(month from comp)::int,least(c.dia_vencimento,ultimo_dia));
    insert into public.cobrancas(contrato_id,imovel_id,inquilino_id,competencia,vencimento,aluguel,outros_encargos,valor_pago,multa,juros,status,observacoes)
    values(c.id,c.imovel_id,c.inquilino_id,comp,venc,c.aluguel_atual,0,0,0,0,'pendente','Cobrança mensal gerada automaticamente')
    on conflict (contrato_id,competencia) where contrato_id is not null do nothing;
    if found then n:=n+1; end if;
  end loop;
  return n;
end $$;
grant execute on function public.gerar_cobrancas_mes(date) to authenticated;

create or replace function public.sincronizar_cobranca_financeiro() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status='pago' and coalesce(new.valor_pago,0)>0 then
    insert into public.financeiro(cobranca_id,imovel_id,contrato_id,data,competencia,tipo,categoria,descricao,entrada,saida,pago,forma_pagamento,comprovante_path,comprovante_nome,comprovante_tipo,observacoes)
    values(new.id,new.imovel_id,new.contrato_id,coalesce(new.data_pagamento,current_date),new.competencia,'receita','Aluguel','Recebimento de aluguel',new.valor_pago,0,true,new.forma_pagamento,new.comprovante_path,new.comprovante_nome,new.comprovante_tipo,'Gerado automaticamente a partir da cobrança')
    on conflict (cobranca_id) where cobranca_id is not null do update set
      imovel_id=excluded.imovel_id,contrato_id=excluded.contrato_id,data=excluded.data,competencia=excluded.competencia,entrada=excluded.entrada,pago=true,forma_pagamento=excluded.forma_pagamento,comprovante_path=excluded.comprovante_path,comprovante_nome=excluded.comprovante_nome,comprovante_tipo=excluded.comprovante_tipo;
  elsif old.status='pago' and new.status<>'pago' then
    delete from public.financeiro where cobranca_id=new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_cobranca_financeiro on public.cobrancas;
create trigger trg_cobranca_financeiro after insert or update on public.cobrancas for each row execute function public.sincronizar_cobranca_financeiro();
