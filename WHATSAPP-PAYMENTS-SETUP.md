# Pagamentos via WhatsApp — configuração

O fluxo já está preparado no aplicativo, mas a conexão externa só funciona depois da configuração do WhatsApp Business/Cloud API e dos segredos no Supabase.

## Segredos da Edge Function

Configure no Supabase:

- `WHATSAPP_ACCESS_TOKEN` — token de acesso da Meta.
- `WHATSAPP_PHONE_NUMBER_ID` — Phone Number ID do número usado pela conta WhatsApp Business.
- `WHATSAPP_VERIFY_TOKEN` — segredo escolhido por você para validar o GET do webhook.
- `WHATSAPP_APP_SECRET` — App Secret da aplicação Meta; usado para validar `x-hub-signature-256`.
- `WHATSAPP_GRAPH_VERSION` — opcional; padrão atual do código: `v23.0`.
- `WHATSAPP_SEND_ACK` — `true` somente quando quiser que o sistema responda automaticamente ao inquilino.
- `OPENAI_API_KEY` — chave para interpretação de imagem/PDF.
- `OPENAI_PAYMENT_MODEL` — opcional; padrão `gpt-5`.

## Webhook

Endpoint:

`https://behmmbgbrsesxthsczdl.supabase.co/functions/v1/whatsapp-payment-webhook`

No painel da Meta, use esse endpoint como callback URL e o mesmo valor configurado em `WHATSAPP_VERIFY_TOKEN` como Verify Token.

Assine o campo de mensagens (`messages`). O endpoint valida a assinatura HMAC do corpo antes de processar o evento.

## Comportamento

1. O WhatsApp envia a mensagem.
2. O webhook identifica o número e procura o inquilino cadastrado.
3. Imagens e PDFs são armazenados em bucket privado.
4. A IA extrai valor, data, forma de pagamento, pagador, destinatário, transação, competência e confiança.
5. O sistema procura cobrança em aberto do mesmo inquilino.
6. Somente uma correspondência com valor exato e confiança >= 90% recebe baixa automática.
7. Casos ambíguos aparecem em **Pagamentos WhatsApp** para confirmação manual.
8. `message_id` impede processamento duplicado.

A baixa automática é uma conciliação do comprovante. Ela não constitui confirmação independente de crédito bancário.
