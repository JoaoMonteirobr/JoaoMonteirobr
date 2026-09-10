import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GRAPH_VERSION = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v23.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WA_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") || "";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const OPENAI_MODEL = Deno.env.get("OPENAI_PAYMENT_MODEL") || "gpt-5";
const SEND_ACK = (Deno.env.get("WHATSAPP_SEND_ACK") || "false") === "true";

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
function normalizePhone(v: string) { return String(v || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""); }
function brDateToIso(v: string | null) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
function extractJson(text: string) {
  const clean = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(clean); } catch (_) {
    const m = clean.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  }
}
async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function verifySignature(req: Request, raw: string) {
  if (!APP_SECRET) return false;
  const header = req.headers.get("x-hub-signature-256") || "";
  if (!header.startsWith("sha256=")) return false;
  const expected = await hmacHex(APP_SECRET, raw);
  return header.slice(7) === expected;
}
async function graph(path: string, init: RequestInit = {}) {
  const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${WA_TOKEN}`, ...(init.headers || {}) },
  });
  const text = await r.text();
  let data: any; try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`WhatsApp Graph ${r.status}: ${data?.error?.message || text}`);
  return data;
}
async function getMedia(mediaId: string) {
  const meta = await graph(mediaId);
  const r = await fetch(meta.url, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
  if (!r.ok) throw new Error(`Falha ao baixar mídia: HTTP ${r.status}`);
  return { meta, bytes: new Uint8Array(await r.arrayBuffer()) };
}
function toDataUrl(bytes: Uint8Array, mime: string) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return `data:${mime};base64,${btoa(binary)}`;
}
async function extractPayment(bytes: Uint8Array, mime: string, filename: string, caption: string | null) {
  if (!OPENAI_KEY) return { status: "revisao", reason: "OPENAI_API_KEY não configurada" };
  const content: any[] = [{ type: "input_text", text: `Analise este comprovante de pagamento de aluguel no Brasil. ${caption ? `Mensagem do inquilino: ${caption}` : ""}\nRetorne SOMENTE JSON válido com estas chaves: valor, data_pagamento, forma_pagamento, pagador, destinatario, transacao_id, competencia, confianca. Use valor numérico em reais, datas YYYY-MM-DD, forma_pagamento entre pix, transferencia, boleto, dinheiro, cartao_credito, cartao_debito, outro. Se um campo não estiver legível, use null. Não invente dados. confianca é 0 a 1.` }];
  if (mime === "application/pdf") content.push({ type: "input_file", filename, file_data: toDataUrl(bytes, mime), detail: "auto" });
  else content.push({ type: "input_image", image_url: toDataUrl(bytes, mime), detail: "high" });
  const r = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: OPENAI_MODEL, input: [{ role: "user", content }], max_output_tokens: 700 }) });
  const text = await r.text();
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${text.slice(0, 500)}`);
  const data = JSON.parse(text);
  const out = data.output_text || data.output?.flatMap((x: any) => x.content || []).map((x: any) => x.text || "").join("") || "";
  const parsed = extractJson(out);
  if (!parsed) return { status: "revisao", reason: "Não foi possível interpretar o comprovante" };
  parsed.data_pagamento = brDateToIso(parsed.data_pagamento);
  parsed.competencia = brDateToIso(parsed.competencia);
  return { status: "ok", data: parsed };
}
async function findTenant(phone: string) {
  const normalized = normalizePhone(phone);
  const all = await db.from("inquilinos").select("id,nome,telefone,status").eq("status", "ativo");
  if (all.error) throw all.error;
  return (all.data || []).find((x: any) => normalizePhone(x.telefone) === normalized) || null;
}
async function reconcile(tenant: any, extracted: any, intakeId: string, mediaPath: string | null, mediaName: string | null, mediaType: string | null) {
  if (!tenant || !extracted?.valor) return { status: "revisao", reason: tenant ? "Valor não identificado" : "Inquilino não identificado" };
  const charges = await db.from("cobrancas").select("id,contrato_id,imovel_id,inquilino_id,competencia,vencimento,aluguel,outros_encargos,valor_pago,multa,juros,status").eq("inquilino_id", tenant.id).neq("status", "pago").order("vencimento", { ascending: true }).limit(24);
  if (charges.error) throw charges.error;
  const value = Number(extracted.valor);
  const candidate = (charges.data || []).map((c: any) => ({ c, total: Number(c.aluguel || 0) + Number(c.outros_encargos || 0) + Number(c.multa || 0) + Number(c.juros || 0) - Number(c.valor_pago || 0) })).sort((a: any,b: any) => Math.abs(a.total-value)-Math.abs(b.total-value))[0];
  if (!candidate || Math.abs(candidate.total - value) > 0.01) return { status: "revisao", reason: "Não foi encontrada cobrança em aberto com o mesmo valor" };
  const confidence = Number(extracted.confianca || 0);
  if (confidence < 0.9) return { status: "revisao", reason: "Confiança da leitura abaixo de 90%", cobranca_id: candidate.c.id };
  const duplicate = await db.from("whatsapp_pagamentos_recebidos").select("id").eq("transacao_id_extraida", extracted.transacao_id).not("transacao_id_extraida", "is", null).limit(1);
  if (extracted.transacao_id && duplicate.data?.length) return { status: "revisao", reason: "Transação já recebida anteriormente", cobranca_id: candidate.c.id };
  const patch: any = { valor_pago: value, data_pagamento: extracted.data_pagamento || new Date().toISOString().slice(0,10), status: "pago", forma_pagamento: extracted.forma_pagamento || "outro", comprovante_path: mediaPath, comprovante_nome: mediaName, comprovante_tipo: mediaType, observacoes: `Baixa automática via WhatsApp. Mensagem ${intakeId}.` };
  const upd = await db.from("cobrancas").update(patch).eq("id", candidate.c.id).eq("status", "pendente");
  if (upd.error) throw upd.error;
  await db.from("financeiro").insert({ imovel_id: candidate.c.imovel_id, contrato_id: candidate.c.contrato_id, cobranca_id: candidate.c.id, data: patch.data_pagamento, competencia: candidate.c.competencia, tipo: "receita", categoria: "Aluguel", descricao: `Pagamento recebido via WhatsApp - ${tenant.nome}`, entrada: value, saida: 0, pago: true, forma_pagamento: patch.forma_pagamento, comprovante_path: mediaPath, comprovante_nome: mediaName, comprovante_tipo: mediaType });
  return { status: "aprovado", cobranca_id: candidate.c.id, reason: "Cobrança conciliada automaticamente" };
}
async function sendText(to: string, body: string) {
  if (!SEND_ACK || !WA_PHONE_ID || !WA_TOKEN) return;
  await graph(`${WA_PHONE_ID}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }) });
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("hub.verify_token") === VERIFY_TOKEN) return new Response(url.searchParams.get("hub.challenge") || "", { status: 200 });
    return json({ ok: true, service: "whatsapp-payment-webhook" });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const raw = await req.text();
  if (!(await verifySignature(req, raw))) return json({ error: "invalid_signature" }, 401);
  let payload: any; try { payload = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }
  const messages = payload?.entry?.flatMap((e: any) => e.changes || []).flatMap((c: any) => c.value?.messages || []) || [];
  for (const msg of messages) {
    const from = msg.from || "";
    const contact = payload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];
    const type = msg.type || "unknown";
    const media = msg.image || msg.document || null;
    const existing = await db.from("whatsapp_pagamentos_recebidos").select("id").eq("message_id", msg.id).maybeSingle();
    if (existing.data) continue;
    const tenant = await findTenant(from);
    const inserted = await db.from("whatsapp_pagamentos_recebidos").insert({ message_id: msg.id, wa_id: from, telefone: from, nome_contato: contact?.profile?.name || null, tipo_mensagem: type, media_id: media?.id || null, media_mime_type: media?.mime_type || null, media_sha256: media?.sha256 || null, media_nome: media?.filename || null, legenda: media?.caption || msg.text?.body || null, inquilino_id: tenant?.id || null, status: "processando" }).select("id").single();
    if (inserted.error) continue;
    const intakeId = inserted.data.id;
    try {
      let extracted: any = null, mediaPath: string | null = null, mediaName: string | null = null, mediaType: string | null = media?.mime_type || null;
      if (media?.id) {
        const downloaded = await getMedia(media.id);
        mediaName = media.filename || `${msg.id}.${mediaType === "application/pdf" ? "pdf" : "jpg"}`;
        mediaPath = `${new Date().toISOString().slice(0,10)}/${tenant?.id || "sem-inquilino"}/${msg.id}-${mediaName}`;
        const up = await db.storage.from("whatsapp-comprovantes").upload(mediaPath, downloaded.bytes, { contentType: mediaType || downloaded.meta.mime_type || "application/octet-stream", upsert: false });
        if (up.error) throw up.error;
        const result = await extractPayment(downloaded.bytes, mediaType || downloaded.meta.mime_type || "image/jpeg", mediaName, media?.caption || null);
        extracted = result.data || null;
      }
      const reconciliation = await reconcile(tenant, extracted, intakeId, mediaPath, mediaName, mediaType);
      await db.from("whatsapp_pagamentos_recebidos").update({ cobranca_id: reconciliation.cobranca_id || null, valor_extraido: extracted?.valor ?? null, data_pagamento_extraida: extracted?.data_pagamento || null, forma_pagamento_extraida: extracted?.forma_pagamento || null, pagador_extraido: extracted?.pagador || null, destinatario_extraido: extracted?.destinatario || null, transacao_id_extraida: extracted?.transacao_id || null, competencia_extraida: extracted?.competencia || null, confianca: extracted?.confianca ?? null, dados_extraidos: extracted || null, media_path: mediaPath, status: reconciliation.status === "aprovado" ? "aprovado" : "revisao", motivo_status: reconciliation.reason, processado_em: new Date().toISOString() }).eq("id", intakeId);
      if (reconciliation.status === "aprovado") await sendText(from, `Pagamento recebido e registrado no sistema. Valor: R$ ${Number(extracted?.valor || 0).toFixed(2).replace(".", ",")}.`);
      else if (tenant) await sendText(from, "Recebi o comprovante. Ele foi encaminhado para conferência antes da baixa.");
    } catch (err) {
      await db.from("whatsapp_pagamentos_recebidos").update({ status: "erro", erro: err instanceof Error ? err.message : String(err), processado_em: new Date().toISOString() }).eq("id", intakeId);
    }
  }
  return json({ received: messages.length });
});
