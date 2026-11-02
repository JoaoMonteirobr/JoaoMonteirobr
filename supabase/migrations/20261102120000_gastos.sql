-- =====================================================
-- ABA GASTOS
-- =====================================================
-- Despesas com os imóveis: tipos cadastráveis, gastos por prédio inteiro
-- ou por unidade e várias notas fiscais/fotos por gasto.
-- Acesso exclusivo do administrador (public.is_admin()).
-- Não altera nenhuma tabela existente.

begin;

-- Interrompe se a função de perfil usada nas políticas não existir neste projeto.
do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() não encontrada: aplique antes as migrations de perfis.';
  end if;
end $$;

-- Tipos de gasto (cadastráveis pela tela). Desativar esconde da lista de escolha
-- sem afetar os gastos antigos.
create table if not exists public.gasto_tipos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 1 and 60),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create unique index if not exists gasto_tipos_nome_unq on public.gasto_tipos (lower(btrim(nome)));

-- Gastos. escopo = 'predio' usa o endereço do prédio (como no agrupamento das telas);
-- escopo = 'unidade' aponta para um imóvel específico.
create table if not exists public.gastos (
  id uuid primary key default gen_random_uuid(),
  escopo text not null check (escopo in ('predio','unidade')),
  predio text,
  imovel_id uuid references public.imoveis(id) on delete restrict,
  tipo_id uuid not null references public.gasto_tipos(id) on delete restrict,
  data date not null default current_date,
  valor numeric(12,2) not null check (valor > 0),
  descricao text not null check (length(btrim(descricao)) > 0),
  fornecedor text,
  forma_pagamento text check (forma_pagamento in ('pix','dinheiro','cartao_credito','cartao_debito','transferencia','boleto','outro')),
  observacoes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint gastos_escopo_alvo check (
    (escopo = 'predio' and predio is not null and length(btrim(predio)) > 0 and imovel_id is null)
    or (escopo = 'unidade' and imovel_id is not null)
  )
);
create index if not exists gastos_data_idx on public.gastos (data desc);
create index if not exists gastos_imovel_idx on public.gastos (imovel_id);
create index if not exists gastos_tipo_idx on public.gastos (tipo_id);

-- Notas fiscais e fotos (arquivos no bucket privado gastos-notas).
create table if not exists public.gasto_anexos (
  id uuid primary key default gen_random_uuid(),
  gasto_id uuid not null references public.gastos(id) on delete cascade,
  arquivo_path text not null unique,
  arquivo_nome text not null,
  arquivo_tipo text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists gasto_anexos_gasto_idx on public.gasto_anexos (gasto_id);

-- Somente administrador lê e grava.
alter table public.gasto_tipos enable row level security;
alter table public.gastos enable row level security;
alter table public.gasto_anexos enable row level security;
revoke all on public.gasto_tipos, public.gastos, public.gasto_anexos from anon;

drop policy if exists gasto_tipos_admin_all on public.gasto_tipos;
create policy gasto_tipos_admin_all on public.gasto_tipos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists gastos_admin_all on public.gastos;
create policy gastos_admin_all on public.gastos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists gasto_anexos_admin_all on public.gasto_anexos;
create policy gasto_anexos_admin_all on public.gasto_anexos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Auditoria, no mesmo padrão das demais tabelas.
do $$
declare t text;
begin
  if to_regprocedure('public.registrar_auditoria()') is not null then
    foreach t in array array['gasto_tipos','gastos','gasto_anexos'] loop
      execute format('drop trigger if exists trg_auditoria_%I on public.%I', t, t);
      execute format('create trigger trg_auditoria_%I after insert or update or delete on public.%I for each row execute function public.registrar_auditoria()', t, t);
    end loop;
  end if;
end $$;

-- Bucket privado das notas: até 10 MB, PDF e imagens.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gastos-notas', 'gastos-notas', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

drop policy if exists gastos_notas_admin_select on storage.objects;
create policy gastos_notas_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'gastos-notas' and public.is_admin());
drop policy if exists gastos_notas_admin_insert on storage.objects;
create policy gastos_notas_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gastos-notas' and public.is_admin());
drop policy if exists gastos_notas_admin_update on storage.objects;
create policy gastos_notas_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'gastos-notas' and public.is_admin()) with check (bucket_id = 'gastos-notas' and public.is_admin());
drop policy if exists gastos_notas_admin_delete on storage.objects;
create policy gastos_notas_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'gastos-notas' and public.is_admin());

-- Tipos iniciais (podem ser renomeados ou desativados pela tela).
insert into public.gasto_tipos (nome)
select x from unnest(array['Reparo','Pintura','Elétrica','Hidráulica','Limpeza']) as x
where not exists (select 1 from public.gasto_tipos t where lower(btrim(t.nome)) = lower(x));

commit;

-- =====================================================
-- DESFAZER (só se necessário, e somente enquanto não houver gastos reais):
-- begin;
-- drop table if exists public.gasto_anexos, public.gastos, public.gasto_tipos;
-- drop policy if exists gastos_notas_admin_select on storage.objects;
-- drop policy if exists gastos_notas_admin_insert on storage.objects;
-- drop policy if exists gastos_notas_admin_update on storage.objects;
-- drop policy if exists gastos_notas_admin_delete on storage.objects;
-- delete from storage.buckets where id = 'gastos-notas';  -- só funciona com o bucket vazio
-- commit;
-- =====================================================
