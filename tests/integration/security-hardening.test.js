import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('infrastructure security contracts', () => {
  test('service worker caches only public same-origin assets', () => {
    const source = read('sw.js');
    expect(source).toContain('url.origin !== self.location.origin');
    expect(source).toContain("['/auth/', '/rest/', '/storage/', '/functions/']");
    expect(source).toContain('canStoreResponse(response)');
    expect(source).toContain('url.origin === self.location.origin');
  });

  test('privileged edge functions authorize callers before using secrets', () => {
    const whatsapp = read('supabase/functions/whatsapp-send/index.ts');
    const push = read('supabase/functions/push-dispatch/index.ts');
    expect(whatsapp.indexOf('requireAdmin(req)')).toBeLessThan(
      whatsapp.indexOf("Deno.env.get('META_WHATSAPP_TOKEN')"),
    );
    expect(push.indexOf("req.headers.get('x-push-dispatch-secret')")).toBeLessThan(
      push.indexOf("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')"),
    );
    expect(push).toContain("db.rpc('claim_push_fila'");
  });

  test('login throttling is scoped and does not disclose administrator contact data', () => {
    const source = read('supabase/functions/secure-login/index.ts');
    expect(source).toContain('account_ip:');
    expect(source).toContain('ip:');
    expect(source).not.toContain('admin_email');
    expect(source).not.toContain('const key = email');
  });

  test('database migration applies least privilege and atomic queue claims', () => {
    const migrations = fs
      .readdirSync(path.join(root, 'supabase/migrations'))
      .filter((file) => file.endsWith('_harden_privileged_functions_and_push_dispatch.sql'));
    expect(migrations).toHaveLength(1);
    const source = read(`supabase/migrations/${migrations[0]}`);
    expect(source).toContain('for update skip locked');
    expect(source).toContain('revoke all on function public.claim_push_fila(integer)');
    expect(source).toContain('revoke all on table public.login_tentativas from anon, authenticated');
    expect(source).toContain("where name = 'push_dispatch_secret'");
    expect(source).toContain('alter policy %I on %I.%I to authenticated');
  });

  test('automation opens pull requests instead of writing implicitly to main', () => {
    const sync = read('.github/workflows/sync-production.yml');
    const vendor = read('.github/workflows/vendor-pdf.yml');
    expect(sync).not.toContain('contents: write');
    expect(sync).not.toMatch(/^\s*git push\s*$/mu);
    expect(vendor).toContain('issue_number:');
    expect(vendor).toContain('gh pr create');
    expect(vendor).toContain('git push --set-upstream origin "$branch"');
  });

  test('workflow actions are pinned to immutable commits', () => {
    const workflowDirectory = path.join(root, '.github', 'workflows');
    for (const file of fs.readdirSync(workflowDirectory)) {
      const source = fs.readFileSync(path.join(workflowDirectory, file), 'utf8');
      for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/gmu)) {
        expect(match[1]).toMatch(/@[0-9a-f]{40}$/iu);
      }
    }
  });
});
