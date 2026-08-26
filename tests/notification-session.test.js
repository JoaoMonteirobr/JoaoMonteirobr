import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('notificações, rota e sessão', () => {
  const source = fs.readFileSync(new URL('../notification-session.js', import.meta.url), 'utf8');
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  it('mantém sino de notificações para o administrador', () => {
    expect(source).toContain('notify_bell');
    expect(source).toContain("currentRole==='admin'?bellMarkup():timerMarkup()");
    expect(source).toContain('resolvido=eq.false');
    expect(source).toContain('setInterval(refreshBell,30000)');
  });

  it('preserva o módulo atual após recarregar', () => {
    expect(source).toContain("var ROUTE_KEY='matos_current_page'");
    expect(source).toContain('sessionStorage.setItem(ROUTE_KEY,page)');
    expect(source).toContain("new URLSearchParams(location.search).get('pagina')");
  });

  it('limita usuários não administradores a 20 minutos', () => {
    expect(source).toContain('var SESSION_LIMIT_MS=20*60*1000');
    expect(source).toContain('Sua sessão de 20 minutos terminou');
    expect(source).toContain("if(currentRole==='admin')");
    expect(source).toContain('setInterval(updateSessionClock,1000)');
  });

  it('carrega os controles antes da inicialização final do app', () => {
    expect(index).toContain('/notification-session.css?v=1');
    expect(index).toContain('/notification-session.js?v=1');
    expect(index.indexOf('/notification-session.js?v=1')).toBeLessThan(index.indexOf('/app3.js'));
  });
});
