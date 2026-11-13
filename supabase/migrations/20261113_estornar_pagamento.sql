-- Estorno auditável de pagamento informado incorretamente.
-- A cobrança e o contrato são preservados; o trigger existente atualiza o financeiro.
-- Comprovante original permanece no bucket privado, mas deixa de aparecer como quitação.
BEGIN;

CREATE OR REPLACE FUNCTION public.estornar_pagamento(
  p_cobranca_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_anterior public.cobrancas%ROWTYPE;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_quando text;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT (SELECT public.is_admin()) THEN
    RAISE EXCEPTION 'Apenas o administrador pode excluir um lançamento de pagamento.'
      USING ERRCODE = '42501';
  END IF;

  IF p_cobranca_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um pagamento válido.' USING ERRCODE = '22023';
  END IF;

  IF length(v_motivo) < 8 OR length(v_motivo) > 240 THEN
    RAISE EXCEPTION 'Informe o motivo da exclusão (8 a 240 caracteres).'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_anterior
    FROM public.cobrancas
   WHERE id = p_cobranca_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O lançamento não foi encontrado. Atualize a página.'
      USING ERRCODE = 'P0002';
  END IF;

  IF coalesce(v_anterior.valor_pago, 0) <= 0 AND v_anterior.data_pagamento IS NULL THEN
    RAISE EXCEPTION 'Este lançamento já não possui pagamento a excluir.'
      USING ERRCODE = '22023';
  END IF;

  v_quando := to_char(
    clock_timestamp() AT TIME ZONE 'America/Rio_Branco',
    'DD/MM/YYYY HH24:MI'
  );

  UPDATE public.cobrancas
     SET valor_pago = 0,
         data_pagamento = NULL,
         forma_pagamento = NULL,
         status = 'pendente',
         comprovante_path = NULL,
         comprovante_nome = NULL,
         comprovante_tipo = NULL,
         observacoes = concat_ws(E'\n',
           nullif(v_anterior.observacoes, ''),
           '[PAGAMENTO EXCLUÍDO EM ' || v_quando || '] ' || v_motivo)
   WHERE id = p_cobranca_id;

  -- Trigger trg_auditoria_cobrancas registra quem alterou e todos os valores anteriores.
  -- Trigger trg_cobranca_financeiro remove o lançamento de receita gerado automaticamente
  -- quando o status passa de pago para pendente.
  RETURN jsonb_build_object(
    'ok', true,
    'cobranca_id', v_anterior.id,
    'valor_excluido', v_anterior.valor_pago,
    'competencia', v_anterior.competencia,
    'comprovante_arquivado', v_anterior.comprovante_path IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.estornar_pagamento(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.estornar_pagamento(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.estornar_pagamento(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.estornar_pagamento(uuid, text) IS
  'Estorno administrativo com motivo e auditoria. Preserva cobrança, contrato e comprovante físico privado.';

COMMIT;
