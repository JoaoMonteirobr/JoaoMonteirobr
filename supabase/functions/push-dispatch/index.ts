import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { GoogleAuth } from 'npm:google-auth-library@9.15.1';
import { secureCompare } from '../_shared/http.ts';

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const expectedSecret = Deno.env.get('PUSH_DISPATCH_SECRET');
  const suppliedSecret = req.headers.get('x-push-dispatch-secret') || '';
  if (!expectedSecret) return json({ error: 'push_dispatch_not_configured' }, 503);
  if (!suppliedSecret || !(await secureCompare(suppliedSecret, expectedSecret))) {
    return json({ error: 'unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const rawServiceAccount = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!supabaseUrl || !serviceRole || !rawServiceAccount) {
    return json({ error: 'push_provider_not_configured' }, 503);
  }

  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(rawServiceAccount);
  } catch {
    return json({ error: 'invalid_push_provider_credentials' }, 500);
  }
  if (typeof serviceAccount.project_id !== 'string' || !serviceAccount.project_id) {
    return json({ error: 'invalid_push_provider_credentials' }, 500);
  }

  let accessToken: string | undefined;
  try {
    const auth = new GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
    const client = await auth.getClient();
    const tokenInfo: any = await client.getAccessToken();
    accessToken = typeof tokenInfo === 'string' ? tokenInfo : tokenInfo?.token;
  } catch (error) {
    console.error('Firebase authentication failed', error instanceof Error ? error.name : 'unknown_error');
  }
  if (!accessToken) return json({ error: 'push_provider_auth_failed' }, 502);

  const db = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const queue = await db.rpc('claim_push_fila', { p_limit: 50 });
  if (queue.error) return json({ error: 'queue_claim_failed' }, 500);
  if (!queue.data?.length) return json({ ok: true, processados: 0 });

  let enviados = 0;
  let erros = 0;
  for (const item of queue.data) {
    const devices = await db
      .from('push_dispositivos')
      .select('endpoint')
      .eq('user_id', item.user_id)
      .eq('ativo', true);
    if (devices.error || !devices.data?.length) {
      await db
        .from('push_fila')
        .update({ status: 'erro', ultimo_erro: 'Nenhum dispositivo ativo', processando_em: null })
        .eq('id', item.id);
      erros += 1;
      continue;
    }

    let anySuccess = false;
    let lastError = '';
    for (const device of devices.data) {
      try {
        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                token: device.endpoint,
                notification: { title: item.titulo, body: item.mensagem },
                data: { url: item.url || '/', tag: `alerta-${item.alerta_id}` },
                webpush: { fcm_options: { link: item.url || '/' } },
              },
            }),
            signal: AbortSignal.timeout(15_000),
          },
        );
        if (response.ok) anySuccess = true;
        else lastError = `FCM ${response.status}`;
      } catch {
        lastError = 'FCM indisponível';
      }
    }

    if (anySuccess) {
      await db
        .from('push_fila')
        .update({
          status: 'enviado',
          enviado_em: new Date().toISOString(),
          ultimo_erro: null,
          processando_em: null,
        })
        .eq('id', item.id);
      enviados += 1;
    } else {
      await db
        .from('push_fila')
        .update({ status: 'erro', ultimo_erro: lastError || 'Falha no envio', processando_em: null })
        .eq('id', item.id);
      erros += 1;
    }
  }

  return json({ ok: true, processados: queue.data.length, enviados, erros });
});
