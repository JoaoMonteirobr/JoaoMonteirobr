import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const contract = JSON.parse(fs.readFileSync(path.join(root, 'architecture.contract.json'), 'utf8'));
const ignoredDirectories = new Set([
  '.git',
  '.vercel',
  'coverage',
  'node_modules',
  'playwright-report',
  'test-results',
  'vendor',
]);
const textExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.sql',
  '.toml',
  '.ts',
  '.yaml',
  '.yml',
]);
let failed = false;

function report(message) {
  console.error(`ARCH-CONTRACT: ${message}`);
  failed = true;
}

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else if (textExtensions.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

for (const file of contract.requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) report(`arquivo obrigatório ausente: ${file}`);
}

const regularExpressions = (contract.forbiddenRegex || []).map((pattern) => new RegExp(pattern, 'i'));
for (const fullPath of walk(root)) {
  const relativePath = path.relative(root, fullPath).replaceAll('\\', '/');
  const text = fs.readFileSync(fullPath, 'utf8');
  if (relativePath !== 'architecture.contract.json') {
    for (const pattern of contract.forbiddenPatterns) {
      if (text.includes(pattern)) report(`padrão sensível encontrado em ${relativePath}: ${pattern}`);
    }
    for (const pattern of regularExpressions) {
      if (pattern.test(text)) report(`possível segredo encontrado em ${relativePath}: ${pattern.source}`);
    }
  }

  if (relativePath.startsWith('.github/workflows/') && /^\s*git push\s*$/mu.test(text)) {
    report(`workflow faz push implícito para a branch atual: ${relativePath}`);
  }
  if (relativePath.startsWith('.github/workflows/')) {
    for (const match of text.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/gmu)) {
      const action = match[1];
      if (!action.startsWith('./') && !/@[0-9a-f]{40}$/iu.test(action)) {
        report(`GitHub Action sem hash imutável em ${relativePath}: ${action}`);
      }
    }
  }
  if (relativePath.startsWith('supabase/functions/') && /npm:[^'"\s]+@\d+['"]/u.test(text)) {
    report(`dependência npm sem versão exata em ${relativePath}`);
  }
}

if (failed) process.exit(1);
console.log('ARCH-CONTRACT: OK');
