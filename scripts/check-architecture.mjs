import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const contract = JSON.parse(fs.readFileSync(path.join(root, 'architecture.contract.json'), 'utf8'));
let failed = false;

for (const file of contract.requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`ARCH-CONTRACT: arquivo obrigatório ausente: ${file}`);
    failed = true;
  }
}

const textFiles = fs.readdirSync(root).filter((name) => /\.(js|html|json|md|yml|yaml|mjs|cjs)$/.test(name));
for (const file of textFiles) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const pattern of contract.forbiddenPatterns) {
    if (text.includes(pattern) && file !== 'architecture.contract.json') {
      console.error(`ARCH-CONTRACT: padrão sensível encontrado em ${file}: ${pattern}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('ARCH-CONTRACT: OK');
