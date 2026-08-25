-- Registro de dispositivos autorizados para futuras notificações push.
-- Não altera dados existentes do sistema.
create table if not exists public.push_dispositivos (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null,
 p256dh text,
 auth_key text,
 plataforma text,
 navegador text,
 ativo boolean not null default true,
 ultimo_uso timestamptz not null default now(),
 created_at timestamptz not null default now(),
 unique(user_id, endpoint)
);
alter table public.push_dispositivos enable row level security;
create policy "usuario consulta seus dispositivos" on public.push_dispositivos for select using (auth.uid()=user_id);
create policy "usuario cadastra seus dispositivos" on public.push_dispositivos for insert with check (auth.uid()=user_id);
create policy "usuario atualiza seus dispositivos" on public.push_dispositivos for update using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "usuario remove seus dispositivos" on public.push_dispositivos for delete using (auth.uid()=user_id);