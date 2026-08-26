# Observabilidade do Matos

## Arquitetura
A aplicação usa `observability.js` como camada vendor-neutral. Ela captura erros globais, rejeições não tratadas, eventos de rede, navegação/performance e spans manuais.

### OpenTelemetry / OTLP
Quando `window.MATOS_OBSERVABILITY.otelEndpoint` estiver configurado, spans são enviados por OTLP/HTTP JSON para um OpenTelemetry Collector compatível. Headers de autenticação devem ser injetados somente no ambiente de deploy e nunca versionados.

### Sentry
O adaptador usa `window.Sentry` quando o agente oficial do Sentry estiver carregado e configurado no ambiente. Erros são enviados com `captureException` e eventos funcionais como breadcrumbs.

### Datadog
O adaptador usa `window.DD_RUM` quando o agente Datadog RUM estiver carregado e configurado. Erros usam `addError` e eventos usam `addAction`.

### New Relic
O adaptador usa `window.newrelic` quando o Browser Agent estiver carregado e configurado. Erros usam `noticeError` e eventos usam `addPageAction`.

## Privacidade e segurança
A telemetria aplica redação automática a campos cujo nome indique senha, token, secret, authorization, API key, CPF, CNPJ ou PIX. Isso é uma barreira adicional, não substitui a obrigação de evitar dados pessoais/sensíveis em eventos.

Nenhum provedor comercial é ativado automaticamente. Essa decisão é deliberada para evitar custo, coleta não autorizada e exposição de credenciais.

## Configuração
Use `observability.config.example.js` apenas como referência. Configurações reais devem vir de secrets/variáveis de ambiente ou de um arquivo gerado no deploy e não versionado.
