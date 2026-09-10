create table if not exists public.whatsapp_pagamentos_recebidos (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique,
  wa_id text not null,
  telefone text,
  nome_contato text,
  tipo_mensagem text not null,
  media_id text,
  media_mime_type text,
  media_sha256 text,
  media_path text,
  media_nome text,
  legenda text,
  recebido_em timestamptz not null default now(),
  inquilino_id uuid references public.inquilinos(id),
  cobranca_id uuid references public.cobrancas(id),
  valor_extraido numeric,
  data_pagamento_extraida date,
  forma_pagamento_extraida text,
  pagador_extraido text,
  destinatario_extraido text,
  transacao_id_extraida text,
  competencia_extraida date,
  confianca numeric check (confianca is null or (confianca >= 0 and confianca <= 1)),
  dados_extraidos jsonb,
  status text not null default 'revisao' check (status in ('processando','aprovado','revisao','rejeitado','erro')),
  motivo_status text,
  processado_em timestamptz,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_pagamentos_wa_id_idx on public.whatsapp_pagamentos_recebidos(wa_id);
create index if not exists whatsapp_pagamentos_inquilino_idx on public.whatsapp_pagamentos_recebidos(inquilino_id);
create index if not exists whatsapp_pagamentos_cobranca_idx on public.whatsapp_pagamentos_recebidos(cobranca_id);
create index if not exists whatsapp_pagamentos_status_idx on public.whatsapp_pagamentos_recebidos(status);
create index if not exists whatsapp_pagamentos_recebido_idx on public.whatsapp_pagamentos_recebidos(recebido_em desc);

alter table public.whatsapp_pagamentos_recebidos enable row level security;

drop policy if exists whatsapp_pagamentos_admin_select on public.whatsapp_pagamentos_recebidos;
create policy whatsapp_pagamentos_admin_select on public.whatsapp_pagamentos_recebidos
for select to authenticated using (exists (select 1 from public.perfis p where p.user_id = auth.uid() and p.role = 'admin'));

drop policy if exists whatsapp_pagamentos_admin_update on public.whatsapp_pagamentos_recebidos;
create policy whatsapp_pagamentos_admin_update on public.whatsapp_pagamentos_recebidos
for update to authenticated using (exists (select 1 from public.perfis p where p.user_id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.perfis p where p.user_id = auth.uid() and p.role = 'admin'));

drop policy if exists whatsapp_pagamentos_admin_insert on public.whatsapp_pagamentos_recebidos;
create policy whatsapp_pagamentos_admin_insert on public.whatsapp_pagamentos_recebidos
for insert to authenticated with check (exists (select 1 from public.perfis p where p.user_id = auth.uid() and p.role = 'admin'));

insert into storage.buckets (id, name, public)
values ('whatsapp-comprovantes', 'whatsapp-comprovantes', false)
on conflict (id) do nothing;

create or replace function public.set_whatsapp_pagamentos_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_whatsapp_pagamentos_updated_at on public.whatsapp_pagamentos_recebidos;
create trigger trg_whatsapp_pagamentos_updated_at before update on public.whatsapp_pagamentos_recebidos
for each row execute function public.set_whatsapp_pagamentos_updated_at();
