import { beforeAll, describe, expect, test } from 'vitest';

beforeAll(async () => {
  globalThis.crypto ??= { getRandomValues: (arr) => arr.fill(7), randomUUID: () => 'test-session' };
  await import('../../observability.js');
});

describe('observability scrub', () => {
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
});
