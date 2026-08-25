create table if not exists public.push_fila (
 id uuid primary key default gen_random_uuid(),
 alerta_id uuid not null references public.alertas(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 titulo text not null,
 mensagem text not null,
 url text not null default '/',
 status text not null default 'pendente' check (status in ('pendente','enviando','enviado','erro')),
 tentativas integer not null default 0,
 ultimo_erro text,
 created_at timestamptz not null default now(),
 enviado_em timestamptz,
 unique(alerta_id,user_id)
);
alter table public.push_fila enable row level security;
create policy "usuario consulta sua fila push" on public.push_fila for select using (auth.uid()=user_id);
create or replace function public.enfileirar_push_alerta() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.push_fila(alerta_id,user_id,titulo,mensagem,url)
 select new.id,p.user_id,new.titulo,new.mensagem,'/?pagina=Alertas'
 from public.perfis p where p.role='admin'
 on conflict(alerta_id,user_id) do nothing;
 return new;
end;
$$;
drop trigger if exists trg_enfileirar_push_alerta on public.alertas;
create trigger trg_enfileirar_push_alerta after insert on public.alertas for each row execute function public.enfileirar_push_alerta();