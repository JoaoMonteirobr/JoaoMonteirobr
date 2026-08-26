(function () {
  'use strict';

  const state = {
    config: null,
    sessionId: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    spans: new Map(),
  };

  function nowNs() {
    return String(BigInt(Date.now()) * 1000000n);
  }

  function randomHex(bytes) {
    const array = new Uint8Array(bytes);
    crypto.getRandomValues(array);
    return Array.from(array, (n) => n.toString(16).padStart(2, '0')).join('');
  }

  function safeConfig() {
    return window.MATOS_OBSERVABILITY || {};
  }

  function scrub(value) {
    if (!value || typeof value !== 'object') return value;
    const blocked = /password|senha|token|secret|authorization|apikey|api_key|cpf|cnpj|pix/i;
    const clone = Array.isArray(value) ? [] : {};
    for (const [key, item] of Object.entries(value)) {
      clone[key] = blocked.test(key) ? '[REDACTED]' : typeof item === 'object' ? scrub(item) : item;
    }
    return clone;
  }

  function resourceAttributes() {
    return [
      { key: 'service.name', value: { stringValue: 'matos-gestao-alugueis' } },
      { key: 'service.version', value: { stringValue: document.documentElement.dataset.build || 'web' } },
      { key: 'deployment.environment', value: { stringValue: location.hostname.includes('vercel.app') ? 'production' : 'local' } },
      { key: 'session.id', value: { stringValue: state.sessionId } },
    ];
  }

  async function sendOtlp(span) {
    const cfg = state.config || safeConfig();
    if (!cfg.otelEndpoint) return;
    const payload = {
      resourceSpans: [{
        resource: { attributes: resourceAttributes() },
        scopeSpans: [{ scope: { name: 'matos.web', version: '1' }, spans: [span] }],
      }],
    };
    try {
      await fetch(cfg.otelEndpoint, {
        method: 'POST',
        keepalive: true,
        headers: { 'content-type': 'application/json', ...(cfg.otelHeaders || {}) },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.debug('[Matos Observability] OTLP indisponível', error);
    }
  }

  function vendorAction(name, data) {
    const clean = scrub(data || {});
    try { window.Sentry?.addBreadcrumb?.({ category: 'matos', message: name, data: clean, level: 'info' }); } catch (_) {}
    try { window.DD_RUM?.addAction?.(name, clean); } catch (_) {}
    try { window.newrelic?.addPageAction?.(name, clean); } catch (_) {}
  }

  function captureException(error, context) {
    const err = error instanceof Error ? error : new Error(String(error));
    const clean = scrub(context || {});
    try { window.Sentry?.captureException?.(err, { extra: clean }); } catch (_) {}
    try { window.DD_RUM?.addError?.(err, clean); } catch (_) {}
    try { window.newrelic?.noticeError?.(err, clean); } catch (_) {}

    const span = {
      traceId: randomHex(16),
      spanId: randomHex(8),
      name: 'frontend.exception',
      kind: 1,
      startTimeUnixNano: nowNs(),
      endTimeUnixNano: nowNs(),
      attributes: [{ key: 'exception.message', value: { stringValue: err.message } }],
      status: { code: 2, message: err.message },
      events: [{ timeUnixNano: nowNs(), name: 'exception', attributes: [{ key: 'exception.type', value: { stringValue: err.name || 'Error' } }] }],
    };
    sendOtlp(span);
  }

  function startSpan(name, attributes) {
    const id = randomHex(8);
    state.spans.set(id, {
      traceId: randomHex(16),
      spanId: id,
      name,
      kind: 1,
      startTimeUnixNano: nowNs(),
      attributes: Object.entries(scrub(attributes || {})).map(([key, value]) => ({ key, value: { stringValue: String(value) } })),
    });
    return id;
  }

  function endSpan(id, status = 'ok') {
    const span = state.spans.get(id);
    if (!span) return;
    span.endTimeUnixNano = nowNs();
    span.status = { code: status === 'ok' ? 1 : 2 };
    state.spans.delete(id);
    sendOtlp(span);
  }

  function track(name, data) {
    vendorAction(name, data);
    const id = startSpan(`event.${name}`, data);
    endSpan(id);
  }

  function collectWebVitals() {
    if (!('PerformanceObserver' in window)) return;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          track('performance', { type: entry.entryType, name: entry.name, duration: Math.round(entry.duration || 0) });
        }
      });
      observer.observe({ entryTypes: ['navigation', 'longtask'] });
    } catch (_) {}
  }

  function init(config) {
    state.config = { ...safeConfig(), ...(config || {}) };
    window.addEventListener('error', (event) => captureException(event.error || event.message, { source: event.filename, line: event.lineno }));
    window.addEventListener('unhandledrejection', (event) => captureException(event.reason, { source: 'unhandledrejection' }));
    window.addEventListener('online', () => track('network.online'));
    window.addEventListener('offline', () => track('network.offline'));
    collectWebVitals();
    track('app.init', { path: location.pathname });
  }

  window.MatosObservability = { init, captureException, track, startSpan, endSpan };
  window.__MatosObservabilityTest = { scrub };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init());
  else init();
})();
