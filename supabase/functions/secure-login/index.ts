import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { corsHeaders, json, readJson } from '../_shared/http.ts';

const ACCOUNT_MAX_ATTEMPTS = 5;
const IP_MAX_ATTEMPTS = 20;
const LOCK_MINUTES = 15;
const WINDOW_MS = LOCK_MINUTES * 60_000;

function deviceLabel(uaRaw: string | null) {
  const ua = uaRaw || '';
  let device = 'Dispositivo desconhecido';
  if (/Android/i.test(ua)) device = 'Android';
  else if (/iPhone/i.test(ua)) device = 'iPhone';
  else if (/iPad/i.test(ua)) device = 'iPad';
  else if (/Windows/i.test(ua)) device = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) device = 'Mac';
  else if (/Linux/i.test(ua)) device = 'Linux';

  let browser = '';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';
  return browser ? `${device} · ${browser}` : device;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function activeAttempt(row: any) {
  if (!row?.ultima_tentativa) return null;
  if (Date.now() - new Date(row.ultima_tentativa).getTime() > WINDOW_MS) return null;
  return row;
}

function lockedUntil(rows: any[]) {
  const timestamps = rows
    .map((row) => activeAttempt(row)?.bloqueado_ate)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => value > Date.now());
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

async function recordFailure(db: any, key: string, current: any, maximum: number) {
  const previous = activeAttempt(current);
  const failures = Number(previous?.falhas || 0) + 1;
  const blockedUntil = failures >= maximum ? new Date(Date.now() + WINDOW_MS).toISOString() : null;
  const timestamp = new Date().toISOString();
  const result = await db.from('login_tentativas').upsert(
    {
      chave: key,
      falhas: Math.min(failures, maximum),
      bloqueado_ate: blockedUntil,
      ultima_tentativa: timestamp,
      updated_at: timestamp,
    },
    { onConflict: 'chave' },
  );
  if (result.error) throw result.error;
  return { failures, blockedUntil };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !publishableKey || !serviceRole) return json(req, { error: 'server_not_configured' }, 503);

  let body: any;
  try {
    body = await readJson(req, 16_384);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'invalid_request';
    return json(req, { error: code }, code === 'request_too_large' ? 413 : 400);
  }
  const email = String(body.email || '')
    .trim()
    .toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return json(req, { error: 'Informe e-mail e senha.' }, 400);

  const forwarded = req.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown';
  const userAgent = req.headers.get('user-agent');
  const accountIpKey = `account_ip:${await sha256(`${email}|${ip}`)}`;
  const ipKey = `ip:${await sha256(ip)}`;

  const db = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const authClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const attempts = await Promise.all([
    db.from('login_tentativas').select('*').eq('chave', accountIpKey).maybeSingle(),
    db.from('login_tentativas').select('*').eq('chave', ipKey).maybeSingle(),
  ]);
  if (attempts.some((attempt) => attempt.error)) {
    return json(req, { error: 'login_security_unavailable' }, 503);
  }
  const accountAttempt = attempts[0].data;
  const ipAttempt = attempts[1].data;
  const existingLock = lockedUntil([accountAttempt, ipAttempt]);
  if (existingLock) {
    return json(
      req,
      {
        error: 'Acesso temporariamente bloqueado por excesso de tentativas.',
        locked: true,
        locked_until: existingLock,
      },
      429,
    );
  }

  const authResult = await authClient.auth.signInWithPassword({ email, password });
  if (authResult.error || !authResult.data.session || !authResult.data.user) {
    try {
      const [accountState, ipState] = await Promise.all([
        recordFailure(db, accountIpKey, accountAttempt, ACCOUNT_MAX_ATTEMPTS),
        recordFailure(db, ipKey, ipAttempt, IP_MAX_ATTEMPTS),
      ]);
      await db.from('login_auditoria').insert({
        user_id: null,
        email,
        sucesso: false,
        ip: ip === 'unknown' ? null : ip,
        user_agent: userAgent,
      });
      const blocked = Boolean(accountState.blockedUntil || ipState.blockedUntil);
      return json(
        req,
        {
          error: blocked
            ? 'Limite de tentativas excedido. Tente novamente mais tarde.'
            : 'E-mail ou senha inválidos.',
          locked: blocked,
          locked_until: accountState.blockedUntil || ipState.blockedUntil,
        },
        blocked ? 429 : 401,
      );
    } catch {
      return json(req, { error: 'login_security_unavailable' }, 503);
    }
  }

  await db.from('login_tentativas').delete().eq('chave', accountIpKey);
  await db.from('login_auditoria').insert({
    user_id: authResult.data.user.id,
    email,
    sucesso: true,
    ip: ip === 'unknown' ? null : ip,
    user_agent: userAgent,
  });

  const profile = await db
    .from('perfis')
    .select('nome,role')
    .eq('user_id', authResult.data.user.id)
    .maybeSingle();
  const who = profile.data?.nome || email;
  const device = deviceLabel(userAgent);
  const loginTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco' });
  const alert = await db
    .from('alertas')
    .insert({
      tipo: 'login',
      titulo: 'Novo acesso ao sistema',
      mensagem: `${who} entrou no sistema em ${loginTime}. Dispositivo: ${device}.`,
      prioridade: 'media',
      data_evento: new Date().toISOString().slice(0, 10),
      referencia_key: `login:${authResult.data.user.id}:${Date.now()}`,
      resolvido: false,
    })
    .select('id')
    .single();
  const admins = await db.from('perfis').select('user_id').eq('role', 'admin');
  if (alert.data?.id && admins.data?.length) {
    await db.from('push_fila').insert(
      admins.data.map((admin) => ({
        alerta_id: alert.data.id,
        user_id: admin.user_id,
        titulo: 'Novo login – Matos',
        mensagem: `${who} acessou o sistema em ${device}.`,
        url: '/',
      })),
    );
  }

  return json(req, { session: authResult.data.session, user: authResult.data.user });
});
