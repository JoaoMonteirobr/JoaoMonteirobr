// Exemplo somente. Não coloque secrets reais neste arquivo.
window.MATOS_OBSERVABILITY = {
  // Endpoint OTLP HTTP de um Collector OpenTelemetry, se utilizado.
  otelEndpoint: '',
  otelHeaders: {},

  // Os adaptadores abaixo são detectados automaticamente quando os agentes
  // oficiais estiverem carregados no ambiente: window.Sentry, window.DD_RUM
  // e window.newrelic. Configure DSN/client token/license somente via secrets
  // e variáveis de ambiente da plataforma de deploy.
  sentryEnabled: false,
  datadogEnabled: false,
  newRelicEnabled: false,
};
