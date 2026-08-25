create table if not exists public.repasses (
  id uuid primary key default gen_random_uuid(),
  proprietario_id uuid not null references public.proprietarios(id) on delete cascade,
  competencia date not null,
  valor_bruto numeric not null default 0,
  taxa_percentual numeric not null default 0,
  taxa_administracao numeric not null default 0,
  outras_deducoes numeric not null default 0,
  valor_liquido numeric not null default 0,
  status text not null default 'pendente',
  data_repasse date,
  forma_pagamento text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(proprietario_id, competencia)
);

alter table public.financeiro add column if not exists repasse_id uuid references public.repasses(id) on delete set null;
create unique index if not exists financeiro_repasse_unico on public.financeiro(repasse_id) where repasse_id is not null;

alter table public.repasses enable row level security;
drop policy if exists repasses_admin_all on public.repasses;
create policy repasses_admin_all on public.repasses for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists repasses_owner_select on public.repasses;
create policy repasses_owner_select on public.repasses for select to authenticated using (
  public.is_admin() or proprietario_id = (select p.proprietario_id from public.perfis p where p.user_id = auth.uid() limit 1)
);

create or replace function public.gerar_repasses_mes(p_competencia date)
returns integer language plpgsql security definer set search_path=public as $$
declare v_comp date:=date_trunc('month',p_competencia)::date; v_count integer:=0;
begin
  if not public.is_admin() then raise exception 'Acesso negado'; end if;
  insert into public.repasses(proprietario_id,competencia,valor_bruto,taxa_percentual,taxa_administracao,outras_deducoes,valor_liquido,status)
  select p.id,v_comp,
    coalesce(sum(case when c.status='pago' then c.valor_pago else 0 end),0),
    coalesce(p.taxa_administracao,0),
    round(coalesce(sum(case when c.status='pago' then c.valor_pago else 0 end),0)*coalesce(p.taxa_administracao,0)/100,2),
    coalesce((select sum(f.saida) from public.financeiro f join public.imoveis i2 on i2.id=f.imovel_id where i2.proprietario_id=p.id and date_trunc('month',coalesce(f.competencia,f.data))::date=v_comp and f.pago=true and f.tipo='despesa'),0),
    greatest(0,coalesce(sum(case when c.status='pago' then c.valor_pago else 0 end),0)-round(coalesce(sum(case when c.status='pago' then c.valor_pago else 0 end),0)*coalesce(p.taxa_administracao,0)/100,2)-coalesce((select sum(f.saida) from public.financeiro f join public.imoveis i3 on i3.id=f.imovel_id where i3.proprietario_id=p.id and date_trunc('month',coalesce(f.competencia,f.data))::date=v_comp and f.pago=true and f.tipo='despesa'),0)),
    'pendente'
  from public.proprietarios p
  left join public.imoveis i on i.proprietario_id=p.id
  left join public.cobrancas c on c.imovel_id=i.id and date_trunc('month',c.competencia)::date=v_comp
  group by p.id,p.taxa_administracao
  having coalesce(sum(case when c.status='pago' then c.valor_pago else 0 end),0)>0
  on conflict(proprietario_id,competencia) do update set valor_bruto=excluded.valor_bruto,taxa_percentual=excluded.taxa_percentual,taxa_administracao=excluded.taxa_administracao,outras_deducoes=excluded.outras_deducoes,valor_liquido=excluded.valor_liquido,updated_at=now()
  where public.repasses.status<>'pago';
  get diagnostics v_count=row_count; return v_count;
end; $$;
grant execute on function public.gerar_repasses_mes(date) to authenticated;

create or replace function public.sincronizar_repasse_financeiro()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='pago' then
   if new.data_repasse is null then new.data_repasse=current_date; end if;
   insert into public.financeiro(imovel_id,contrato_id,data,competencia,tipo,categoria,descricao,entrada,saida,pago,observacoes,forma_pagamento,repasse_id)
   values(null,null,new.data_repasse,new.competencia,'repasse','Repasse','Repasse ao proprietário',0,new.valor_liquido,true,new.observacoes,new.forma_pagamento,new.id)
   on conflict(repasse_id) where repasse_id is not null do update set data=excluded.data,competencia=excluded.competencia,saida=excluded.saida,pago=true,observacoes=excluded.observacoes,forma_pagamento=excluded.forma_pagamento;
 elsif old.status='pago' and new.status<>'pago' then delete from public.financeiro where repasse_id=new.id; end if;
 return new;
end; $$;
drop trigger if exists trg_sincronizar_repasse_financeiro on public.repasses;
create trigger trg_sincronizar_repasse_financeiro before update on public.repasses for each row execute function public.sincronizar_repasse_financeiro();
