import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('application shell', () => {
  test('loads critical observability and motion assets', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('/observability.js');
    expect(html).toContain('/motion-system.js');
    expect(html).toContain('manifest.webmanifest');
  });
});
