-- Central de alertas e preparação para WhatsApp
create table if not exists public.alertas (
  id uuid primary key default gen_random_uuid(), tipo text not null, titulo text not null, mensagem text not null,
  prioridade text not null default 'media' check (prioridade in ('baixa','media','alta','urgente')),
  imovel_id uuid references public.imoveis(id) on delete cascade, contrato_id uuid references public.contratos(id) on delete cascade,
  cobranca_id uuid references public.cobrancas(id) on delete cascade, documento_id uuid references public.documentos(id) on delete cascade,
  data_evento date, referencia_key text not null unique, resolvido boolean not null default false,
  resolvido_em timestamptz, created_at timestamptz not null default now()
);
alter table public.alertas enable row level security;
alter table public.configuracoes add column if not exists whatsapp_ativo boolean not null default false;
alter table public.configuracoes add column if not exists whatsapp_numero text;
alter table public.configuracoes add column if not exists whatsapp_phone_number_id text;
alter table public.configuracoes add column if not exists aviso_cobranca_dias integer not null default 3;
alter table public.configuracoes add column if not exists aviso_documento_dias integer not null default 30;
-- A migration aplicada em produção contém as políticas RLS e a função gerar_alertas_operacionais().
-- O envio WhatsApp é feito pela Edge Function whatsapp-send; credenciais Meta devem ficar somente em secrets do Supabase.
