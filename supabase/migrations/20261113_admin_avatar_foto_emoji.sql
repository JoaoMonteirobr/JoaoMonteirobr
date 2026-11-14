-- Avatar opcional e privado para administradores; outros perfis permanecem inalterados.
BEGIN;

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS avatar_tipo text NOT NULL DEFAULT 'inicial',
  ADD COLUMN IF NOT EXISTS avatar_emoji text,
  ADD COLUMN IF NOT EXISTS avatar_path text;

ALTER TABLE public.perfis
  ADD CONSTRAINT perfis_avatar_tipo_valido CHECK (avatar_tipo IN ('inicial','emoji','foto'));

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('avatares-admin','avatares-admin',false,2097152,ARRAY['image/jpeg','image/png','image/webp']::text[])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatar_admin_self_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id='avatares-admin'
    AND public.is_admin()
    AND (storage.foldername(name))[1]=(select auth.uid())::text);

CREATE POLICY "avatar_admin_self_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id='avatares-admin'
    AND public.is_admin()
    AND (storage.foldername(name))[1]=(select auth.uid())::text);

CREATE POLICY "avatar_admin_self_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id='avatares-admin'
    AND public.is_admin()
    AND (storage.foldername(name))[1]=(select auth.uid())::text);

CREATE OR REPLACE FUNCTION public.definir_meu_avatar(
  p_tipo text,
  p_emoji text DEFAULT NULL,
  p_path text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_id uuid := (select auth.uid());
  v_role text;
  v_emojis text[] := ARRAY[
    '😎','🤓','🤠','🥳','😺','🐼','🦁','🐯','🦊','🐻','🐸','🐵',
    '🦄','🐉','👽','🤖','👻','🎃','🧙','🧑‍🚀','🦸','🥷','👑','🦖'
  ];
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida. Entre novamente.' USING ERRCODE='42501';
  END IF;
  SELECT role INTO v_role FROM public.perfis WHERE user_id=v_id FOR UPDATE;
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Somente o administrador pode alterar o próprio avatar nesta seção.'
      USING ERRCODE='42501';
  END IF;

  IF p_tipo NOT IN ('inicial','emoji','foto') OR p_tipo IS NULL THEN
    RAISE EXCEPTION 'Tipo de avatar inválido.' USING ERRCODE='22023';
  END IF;

  IF p_tipo='emoji' AND (p_emoji IS NULL OR NOT p_emoji=ANY(v_emojis)) THEN
    RAISE EXCEPTION 'Escolha um personagem da galeria.' USING ERRCODE='22023';
  END IF;

  IF p_tipo='foto' THEN
    IF p_path IS NULL OR p_path !~ ('^'||v_id::text||'/[0-9a-f-]{36}[.](jpg|png|webp)$')
      OR NOT EXISTS (
        SELECT 1 FROM storage.objects
        WHERE bucket_id='avatares-admin' AND name=p_path AND owner_id=v_id::text
      ) THEN
      RAISE EXCEPTION 'Foto inválida ou não enviada por este administrador.'
        USING ERRCODE='42501';
    END IF;
  END IF;

  UPDATE public.perfis
  SET avatar_tipo=p_tipo,
      avatar_emoji=CASE WHEN p_tipo='emoji' THEN p_emoji ELSE NULL END,
      avatar_path=CASE WHEN p_tipo='foto' THEN p_path ELSE NULL END
  WHERE user_id=v_id;
  RETURN jsonb_build_object(
    'ok',true,'avatar_tipo',p_tipo,
    'avatar_emoji',CASE WHEN p_tipo='emoji' THEN p_emoji ELSE NULL END,
    'avatar_path',CASE WHEN p_tipo='foto' THEN p_path ELSE NULL END
  );
END
$function$;

REVOKE ALL ON FUNCTION public.definir_meu_avatar(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.definir_meu_avatar(text,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.definir_meu_avatar(text,text,text) TO authenticated;

COMMENT ON FUNCTION public.definir_meu_avatar(text,text,text)
IS 'Atualiza exclusivamente o avatar do administrador autenticado. Fotos no bucket privado e emojis da galeria.';

COMMIT;
