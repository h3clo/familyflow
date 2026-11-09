/**
 * Fail if any relative markdown link target is missing.
 * No extra npm dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const root = process.cwd();
const files = walk(root);
const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
let broken = 0;

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = linkRe.exec(text))) {
    let href = match[1].trim();
    if (href.startsWith('<') && href.endsWith('>')) href = href.slice(1, -1);
    href = href.split(/\s+/)[0].replace(/\\*$/, '');
    const bare = href.split('#')[0];
    if (!bare || bare.startsWith('http://') || bare.startsWith('https://') || bare.startsWith('mailto:')) {
      continue;
    }
    const target = path.resolve(path.dirname(file), bare);
    if (!fs.existsSync(target)) {
      console.error(`Broken link: ${path.relative(root, file)} → ${href}`);
      broken += 1;
    }
  }
}

if (broken) {
  console.error(`\n${broken} broken relative markdown link(s).`);
  process.exit(1);
}

console.log(`OK: ${files.length} markdown file(s), relative links resolve.`);
