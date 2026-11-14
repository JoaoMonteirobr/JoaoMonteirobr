-- Registro de parcelas efetivamente pagas no IPTU anual.
-- NULL significa "quantidade ainda não conferida" (não significa zero).
-- Não sobrescreve datas, observações ou valores originais.
BEGIN;

ALTER TABLE public.iptu
  ADD COLUMN IF NOT EXISTS parcelas_pagas integer;

COMMENT ON COLUMN public.iptu.parcelas_pagas IS
  'Quantidade de parcelas quitadas. NULL = não conferido/informado; 0 = nenhuma parcela paga.';

-- Cadastros antigos com IPTU parcelado marcado integralmente pago: todas as
-- parcelas estão quitadas segundo o registro existente.
UPDATE public.iptu
   SET parcelas_pagas = numero_parcelas
 WHERE modalidade = 'parcelado'
   AND situacao = 'pago'
   AND parcelas_pagas IS NULL;

-- Dois registros legados informam explicitamente "tenho apenas 3 comprovantes"
-- de quatro parcelas. São as únicas quantidades parciais suportadas por
-- evidência explícita no cadastro. Outras observações permanecem NÃO CONFERIDAS.
UPDATE public.iptu
   SET parcelas_pagas = 3
 WHERE modalidade = 'parcelado'
   AND situacao IN ('em_aberto','pendente')
   AND numero_parcelas = 4
   AND parcelas_pagas IS NULL
   AND observacoes ~* 'TENHO APENAS 3 COMPROVANTES';

ALTER TABLE public.iptu
  ADD CONSTRAINT iptu_parcelas_pagas_quantidade_valida
  CHECK (
    parcelas_pagas IS NULL
    OR (numero_parcelas >= 1 AND parcelas_pagas BETWEEN 0 AND numero_parcelas)
  );

ALTER TABLE public.iptu
  ADD CONSTRAINT iptu_parcelas_pagas_situacao_coerente
  CHECK (
    modalidade <> 'parcelado'
    OR parcelas_pagas IS NULL
    OR ((situacao = 'pago') = (parcelas_pagas = numero_parcelas))
  );

COMMIT;
