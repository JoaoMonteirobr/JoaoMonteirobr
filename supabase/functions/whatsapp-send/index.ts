import { corsHeaders, json, readJson, requireAdmin } from '../_shared/http.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);

  const authorization = await requireAdmin(req);
  if ('error' in authorization) {
    return json(req, { error: authorization.error }, authorization.error === 'forbidden' ? 403 : 401);
  }

  const token = Deno.env.get('META_WHATSAPP_TOKEN');
  const phoneId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');
  const graphVersion = Deno.env.get('META_GRAPH_VERSION');
  if (!token || !phoneId || !graphVersion) {
    return json(req, { configured: false, error: 'whatsapp_not_configured' }, 503);
  }
  if (!/^v\d+\.\d+$/.test(graphVersion)) {
    return json(req, { configured: false, error: 'invalid_graph_version' }, 503);
  }

  try {
    const body = await readJson(req, 16_384);
    const to = String(body.to || '').replace(/\D/g, '');
    const message = String(body.message || '').trim();
    if (to.length < 10 || to.length > 15 || !message) {
      return json(req, { error: 'invalid_recipient_or_message' }, 400);
    }

    const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: message.slice(0, 4096) },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json(req, { configured: true, ok: false, error: 'meta_request_failed' }, response.status);
    }
    return json(req, {
      configured: true,
      ok: true,
      message_id: data?.messages?.[0]?.id || null,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'request_too_large') return json(req, { error: code }, 413);
    if (code === 'invalid_json') return json(req, { error: code }, 400);
    console.error('whatsapp-send failed', error instanceof Error ? error.name : 'unknown_error');
    return json(req, { error: 'whatsapp_request_failed' }, 502);
  }
});
