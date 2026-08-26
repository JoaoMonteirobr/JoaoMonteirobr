import { beforeAll, describe, expect, test, vi } from 'vitest';

beforeAll(async () => {
  globalThis.crypto ??= { getRandomValues: (arr) => arr.fill(7), randomUUID: () => 'test-session' };
  window.MATOS_OBSERVABILITY = {};
  window.Sentry = { addBreadcrumb: vi.fn(), captureException: vi.fn() };
  window.DD_RUM = { addAction: vi.fn(), addError: vi.fn() };
  window.newrelic = { addPageAction: vi.fn(), noticeError: vi.fn() };
  await import('../../observability.js');
});

describe('observability', () => {
  test('redacts sensitive fields recursively', () => {
    const result = window.__MatosObservabilityTest.scrub({
      nome: 'Maria',
      token: 'secret',
      nested: { senha: '123', cidade: 'Rio Branco' }
    });
    expect(result.nome).toBe('Maria');
    expect(result.token).toBe('[REDACTED]');
    expect(result.nested.senha).toBe('[REDACTED]');
    expect(result.nested.cidade).toBe('Rio Branco');
  });

  test('tracks actions across configured vendor adapters', () => {
    window.MatosObservability.track('cobranca.aberta', { origem: 'teste', token: 'nao-vazar' });
    expect(window.Sentry.addBreadcrumb).toHaveBeenCalled();
    expect(window.DD_RUM.addAction).toHaveBeenCalled();
    expect(window.newrelic.addPageAction).toHaveBeenCalled();
  });

  test('captures exceptions without breaking the app', () => {
    expect(() => window.MatosObservability.captureException(new Error('falha de teste'), { senha: '123' })).not.toThrow();
    expect(window.Sentry.captureException).toHaveBeenCalled();
    expect(window.DD_RUM.addError).toHaveBeenCalled();
    expect(window.newrelic.noticeError).toHaveBeenCalled();
  });

  test('creates and closes spans safely', () => {
    const id = window.MatosObservability.startSpan('teste.span', { modulo: 'financeiro' });
    expect(typeof id).toBe('string');
    expect(() => window.MatosObservability.endSpan(id)).not.toThrow();
    expect(() => window.MatosObservability.endSpan('inexistente')).not.toThrow();
  });
});
