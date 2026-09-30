import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const DEFAULT_ORIGINS = [
  'https://gestao-alugueis-jp.vercel.app',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
];

function allowedOrigins() {
  const configured = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...configured]);
}

export function corsHeaders(req: Request) {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (origin && allowedOrigins().has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

export async function readJson(req: Request, maxBytes = 32_768) {
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > maxBytes) throw new Error('request_too_large');
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new Error('request_too_large');
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw new Error('invalid_json');
  }
}

export async function requireAdmin(req: Request) {
  const authorization = req.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return { error: 'unauthenticated' as const };

  const url = Deno.env.get('SUPABASE_URL');
  const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !publishableKey) return { error: 'server_not_configured' as const };

  const token = authorization.slice('Bearer '.length);
  const client = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { error: 'unauthenticated' as const };

  const profile = await client.from('perfis').select('role').eq('user_id', data.user.id).maybeSingle();
  if (profile.error || profile.data?.role !== 'admin') return { error: 'forbidden' as const };
  return { user: data.user, client };
}

export async function secureCompare(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}
