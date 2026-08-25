-- Central privada de documentos e vistorias
create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(), titulo text not null, categoria text not null default 'Outro',
  imovel_id uuid references public.imoveis(id) on delete cascade, contrato_id uuid references public.contratos(id) on delete set null,
  proprietario_id uuid references public.proprietarios(id) on delete set null, inquilino_id uuid references public.inquilinos(id) on delete set null,
  data_documento date, validade date, arquivo_path text not null, arquivo_nome text not null, arquivo_tipo text, observacoes text,
  created_at timestamptz not null default now(), created_by uuid default auth.uid()
);
create table if not exists public.vistorias (
  id uuid primary key default gen_random_uuid(), imovel_id uuid not null references public.imoveis(id) on delete cascade,
  contrato_id uuid references public.contratos(id) on delete set null, tipo text not null default 'entrada' check (tipo in ('entrada','saida','periodica','manutencao')),
  data_vistoria date not null default current_date, responsavel text, status text not null default 'rascunho' check (status in ('rascunho','concluida')),
  observacoes text, created_at timestamptz not null default now(), created_by uuid default auth.uid()
);
create table if not exists public.vistoria_itens (
  id uuid primary key default gen_random_uuid(), vistoria_id uuid not null references public.vistorias(id) on delete cascade,
  comodo text not null, item text not null, estado text not null default 'bom' check (estado in ('novo','bom','regular','ruim','danificado')),
  observacoes text, foto_path text, foto_nome text, created_at timestamptz not null default now()
);
alter table public.documentos enable row level security; alter table public.vistorias enable row level security; alter table public.vistoria_itens enable row level security;
create index if not exists documentos_imovel_idx on public.documentos(imovel_id); create index if not exists documentos_contrato_idx on public.documentos(contrato_id);
create index if not exists vistorias_imovel_idx on public.vistorias(imovel_id); create index if not exists vistoria_itens_vistoria_idx on public.vistoria_itens(vistoria_id);
-- As políticas RLS e o bucket privado documentos-imoveis são aplicados pela migration de produção correspondente no Supabase.
