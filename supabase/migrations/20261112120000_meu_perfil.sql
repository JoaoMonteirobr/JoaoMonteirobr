-- Aba "Meu perfil": cada usuário altera somente o próprio nome.
-- Função com security definer para não exigir política de UPDATE em perfis
-- (o usuário nunca consegue mudar papel, vínculo ou o perfil de outra pessoa).
create or replace function public.atualizar_meu_nome(p_nome text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
begin
  if auth.uid() is null then
    raise exception 'Faça login novamente.';
  end if;
  if char_length(v_nome) < 2 or char_length(v_nome) > 80 then
    raise exception 'O nome deve ter entre 2 e 80 letras.';
  end if;
  if position('@' in v_nome) > 0 then
    raise exception 'Digite seu nome, não o e-mail.';
  end if;
  update public.perfis set nome = v_nome where user_id = auth.uid();
  if not found then
    raise exception 'Perfil não encontrado.';
  end if;
  return v_nome;
end;
$$;

revoke all on function public.atualizar_meu_nome(text) from public, anon;
grant execute on function public.atualizar_meu_nome(text) to authenticated;

-- Para desfazer:
-- drop function if exists public.atualizar_meu_nome(text);
