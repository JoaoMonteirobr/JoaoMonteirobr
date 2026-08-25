import { createClient } from 'npm:@supabase/supabase-js@2';
import { GoogleAuth } from 'npm:google-auth-library@9';

Deno.serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const rawServiceAccount = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!rawServiceAccount) {
    return new Response(JSON.stringify({ ok:false, setup_required:true, message:'FIREBASE_SERVICE_ACCOUNT_JSON não configurado' }), { status:503, headers:{'content-type':'application/json'} });
  }

  let serviceAccount:any;
  try { serviceAccount = JSON.parse(rawServiceAccount); }
  catch { return new Response(JSON.stringify({ ok:false, message:'Credencial Firebase inválida' }), { status:500, headers:{'content-type':'application/json'} }); }

  const db = createClient(supabaseUrl, serviceRole, { auth:{ persistSession:false } });
  const { data: fila, error: filaErr } = await db.from('push_fila').select('*').eq('status','pendente').lt('tentativas',5).order('created_at',{ascending:true}).limit(50);
  if (filaErr) return new Response(JSON.stringify({ok:false,error:filaErr.message}),{status:500,headers:{'content-type':'application/json'}});
  if (!fila?.length) return new Response(JSON.stringify({ok:true,processados:0}),{headers:{'content-type':'application/json'}});

  const auth = new GoogleAuth({ credentials:serviceAccount, scopes:['https://www.googleapis.com/auth/firebase.messaging'] });
  const client = await auth.getClient();
  const tokenInfo:any = await client.getAccessToken();
  const accessToken = typeof tokenInfo === 'string' ? tokenInfo : tokenInfo?.token;
  if (!accessToken) return new Response(JSON.stringify({ok:false,error:'Não foi possível obter token OAuth do Firebase'}),{status:500,headers:{'content-type':'application/json'}});

  let enviados=0, erros=0;
  for (const item of fila) {
    await db.from('push_fila').update({status:'enviando',tentativas:(item.tentativas||0)+1}).eq('id',item.id);
    const { data: devices } = await db.from('push_dispositivos').select('endpoint').eq('user_id',item.user_id).eq('ativo',true);
    if (!devices?.length) {
      await db.from('push_fila').update({status:'erro',ultimo_erro:'Nenhum dispositivo ativo'}).eq('id',item.id);
      erros++; continue;
    }
    let anySuccess=false; let lastError='';
    for (const dev of devices) {
      const resp = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
        method:'POST',
        headers:{'authorization':`Bearer ${accessToken}`,'content-type':'application/json'},
        body:JSON.stringify({message:{token:dev.endpoint,notification:{title:item.titulo,body:item.mensagem},data:{url:item.url||'/',tag:`alerta-${item.alerta_id}`},webpush:{fcm_options:{link:item.url||'/'}}}})
      });
      if (resp.ok) anySuccess=true;
      else lastError = `${resp.status} ${await resp.text()}`.slice(0,800);
    }
    if (anySuccess) {
      await db.from('push_fila').update({status:'enviado',enviado_em:new Date().toISOString(),ultimo_erro:null}).eq('id',item.id);
      enviados++;
    } else {
      await db.from('push_fila').update({status:'erro',ultimo_erro:lastError||'Falha no envio'}).eq('id',item.id);
      erros++;
    }
  }
  return new Response(JSON.stringify({ok:true,processados:fila.length,enviados,erros}),{headers:{'content-type':'application/json'}});
});