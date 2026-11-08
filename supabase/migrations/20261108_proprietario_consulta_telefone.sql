-- Matos: perfil de consulta geral com login por telefone.
-- O proprietário consulta a carteira inteira, inclusive imóveis sem proprietário_id,
-- mas não recebe permissão de escrita, de administração nem de acesso a auditorias.
BEGIN;

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS telefone_login text;

ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_role_check;
ALTER TABLE public.perfis ADD CONSTRAINT perfis_role_check
  CHECK (role IN ('admin','proprietario','inquilino','proprietario_consulta'));

ALTER TABLE public.perfis ADD CONSTRAINT perfis_consulta_telefone_check
  CHECK (
    role <> 'proprietario_consulta'
    OR (proprietario_id IS NOT NULL AND telefone_login ~ '^[1-9][0-9]{10}$')
  );

CREATE UNIQUE INDEX IF NOT EXISTS perfis_telefone_login_unique
  ON public.perfis (telefone_login)
  WHERE telefone_login IS NOT NULL;

-- Esta função usa RLS do próprio perfil (perfis_self_select).
-- Nunca confia na role presente nos metadados editáveis do JWT.
CREATE OR REPLACE FUNCTION public.eh_consulta_geral()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis p
    WHERE p.user_id = (SELECT auth.uid())
      AND p.role = 'proprietario_consulta'
      AND p.telefone_login IS NOT NULL
      AND p.proprietario_id IS NOT NULL
  );
$$;
REVOKE ALL ON FUNCTION public.eh_consulta_geral() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eh_consulta_geral() TO authenticated;

-- Exclusivamente SELECT: sem possibilidade de alterar registros pela API.
CREATE POLICY imoveis_consulta_geral_select ON public.imoveis
  FOR SELECT TO authenticated
  USING (public.eh_consulta_geral());

CREATE POLICY inquilinos_consulta_geral_select ON public.inquilinos
  FOR SELECT TO authenticated
  USING (public.eh_consulta_geral());

CREATE POLICY proprietarios_consulta_geral_select ON public.proprietarios
  FOR SELECT TO authenticated
  USING (public.eh_consulta_geral());

CREATE POLICY contratos_consulta_geral_select ON public.contratos
  FOR SELECT TO authenticated
  USING (public.eh_consulta_geral());

CREATE POLICY cobrancas_consulta_geral_select ON public.cobrancas
  FOR SELECT TO authenticated
  USING (public.eh_consulta_geral());

CREATE POLICY financeiro_consulta_geral_select ON public.financeiro
  FOR SELECT TO authenticated
  USING (public.eh_consulta_geral());

CREATE POLICY iptu_consulta_geral_select ON public.iptu
  FOR SELECT TO authenticated
  USING (public.eh_consulta_geral());

CREATE POLICY manutencoes_consulta_geral_select ON public.manutencoes
  FOR SELECT TO authenticated
  USING (public.eh_consulta_geral());

CREATE POLICY documentos_consulta_geral_select ON public.documentos
  FOR SELECT TO authenticated
  USING (public.eh_consulta_geral());

CREATE POLICY repasses_consulta_geral_select ON public.repasses
  FOR SELECT TO authenticated
  USING (public.eh_consulta_geral());

CREATE POLICY vistorias_consulta_geral_select ON public.vistorias
  FOR SELECT TO authenticated
  USING (public.eh_consulta_geral());

CREATE POLICY vistoria_itens_consulta_geral_select ON public.vistoria_itens
  FOR SELECT TO authenticated
  USING (public.eh_consulta_geral());

CREATE POLICY gastos_consulta_geral_select ON public.gastos
  FOR SELECT TO authenticated
  USING (public.eh_consulta_geral());

CREATE POLICY gasto_tipos_consulta_geral_select ON public.gasto_tipos
  FOR SELECT TO authenticated
  USING (public.eh_consulta_geral());

CREATE POLICY gasto_anexos_consulta_geral_select ON public.gasto_anexos
  FOR SELECT TO authenticated
  USING (public.eh_consulta_geral());

-- Comprovantes privados: somente documentos ligados a registros visíveis.
CREATE POLICY comprovantes_consulta_geral_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'comprovantes' AND public.eh_consulta_geral()
    AND (
      EXISTS (SELECT 1 FROM public.cobrancas c WHERE c.comprovante_path = name)
      OR EXISTS (SELECT 1 FROM public.financeiro f WHERE f.comprovante_path = name)
    )
  );

-- Documentos e fotos de vistoria.
CREATE POLICY documentos_consulta_geral_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documentos-imoveis' AND public.eh_consulta_geral()
    AND (
      EXISTS (SELECT 1 FROM public.documentos d WHERE d.arquivo_path = name)
      OR EXISTS (SELECT 1 FROM public.vistoria_itens v WHERE v.foto_path = name)
    )
  );

-- Notas de gastos.
CREATE POLICY gastos_notas_consulta_geral_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'gastos-notas' AND public.eh_consulta_geral()
    AND EXISTS (SELECT 1 FROM public.gasto_anexos ga WHERE ga.arquivo_path = name)
  );

COMMIT;
