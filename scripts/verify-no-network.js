import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';

const networkPatterns = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\baxios\b/,
  /\bhttp\.request\b/,
  /\bhttps\.request\b/,
  /\bnet\.connect\b/,
  /\bdgram\.createSocket\b/,
];

const files = [];
for await (const file of glob('src/**/*.{js,cjs,html,css}')) {
  files.push(file);
}

for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const pattern of networkPatterns) {
    if (pattern.test(text)) {
      throw new Error(`Potential network API found in ${file}: ${pattern}`);
    }
  }
}

console.log(`No direct network APIs found in ${files.length} source files.`);
