-- Central de alertas operacionais
create table if not exists public.alertas (
  id uuid primary key default gen_random_uuid(), tipo text not null, titulo text not null, mensagem text not null,
  prioridade text not null default 'media' check (prioridade in ('baixa','media','alta','urgente')),
  imovel_id uuid references public.imoveis(id) on delete cascade, contrato_id uuid references public.contratos(id) on delete cascade,
  cobranca_id uuid references public.cobrancas(id) on delete cascade, documento_id uuid references public.documentos(id) on delete cascade,
  data_evento date, referencia_key text not null unique, resolvido boolean not null default false,
  resolvido_em timestamptz, created_at timestamptz not null default now()
);
alter table public.alertas enable row level security;
alter table public.configuracoes add column if not exists aviso_cobranca_dias integer not null default 3;
alter table public.configuracoes add column if not exists aviso_documento_dias integer not null default 30;
-- As políticas RLS e a função gerar_alertas_operacionais() são mantidas no Supabase.
-- A Central de Alertas é independente de serviços externos de mensageria.