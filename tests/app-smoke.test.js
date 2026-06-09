import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('main process loads a CommonJS preload bridge for Electron', async () => {
  const main = await readFile('src/main.js', 'utf8');
  const preload = await readFile('src/preload.cjs', 'utf8');

  assert.match(main, /preload:\s*join\(__dirname,\s*'preload\.cjs'\)/);
  assert.match(preload, /require\('electron'\)/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\('vanityApi'/);
});

test('target count accepts the Chinese unlimited label without mojibake', async () => {
  const main = await readFile('src/main.js', 'utf8');

  assert.match(main, /raw === '无限'/);
  assert.doesNotMatch(main, /鏃犻檺/);
});

test('controls use wrapping layout so Chinese button text does not overflow', async () => {
  const css = await readFile('src/renderer/styles.css', 'utf8');

  assert.match(css, /\.control-row\s*{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(96px,\s*1fr\)\)/);
  assert.match(css, /button[\s\S]*white-space:\s*normal/);
  assert.match(css, /table button[\s\S]*min-width:\s*52px/);
});

test('encryption is optional by default and footer includes Telegram link', async () => {
  const html = await readFile('src/renderer/index.html', 'utf8');
  const renderer = await readFile('src/renderer/renderer.js', 'utf8');
  const preload = await readFile('src/preload.cjs', 'utf8');

  assert.match(html, /id="encryptPrivateKeys" type="checkbox"/);
  assert.doesNotMatch(html, /id="encryptPrivateKeys" type="checkbox" checked/);
  assert.match(html, /TG@nbb111222/);
  assert.match(renderer, /openExternal\('https:\/\/t\.me\/nbb111222'\)/);
  assert.match(preload, /openExternal/);
});

test('renderer exposes reliable copy and private-key actions through main process', async () => {
  const renderer = await readFile('src/renderer/renderer.js', 'utf8');
  const preload = await readFile('src/preload.cjs', 'utf8');
  const main = await readFile('src/main.js', 'utf8');
  const html = await readFile('src/renderer/index.html', 'utf8');

  assert.match(preload, /copyText/);
  assert.match(main, /clipboard\.writeText/);
  assert.match(renderer, /window\.vanityApi\.copyText/);
  assert.match(renderer, /window\.vanityApi\.getPrivateKey/);
  assert.match(renderer, /showPrivateKeyModal/);
  assert.match(renderer, /copyPrivateKeyBtn/);
  assert.match(html, /id="privateKeyModal"/);
  assert.match(renderer, /result\.keyEncrypted/);
  assert.match(renderer, /data-key-copy/);
  assert.match(renderer, /readPrivateKeyFromButton/);
});

test('result files are plain txt with only address and key fields', async () => {
  const main = await readFile('src/main.js', 'utf8');

  assert.match(main, /results\.txt/);
  assert.match(main, /suspicious\.txt/);
  assert.match(main, /formatTxtResultLine/);
  assert.match(main, /app\.getPath\('userData'\)/);
  assert.doesNotMatch(main, /results\.jsonl/);
  assert.doesNotMatch(main, /suspicious\.jsonl/);
});

test('UI supports combined matching modes and clear probability progress labels', async () => {
  const html = await readFile('src/renderer/index.html', 'utf8');
  const renderer = await readFile('src/renderer/renderer.js', 'utf8');

  assert.match(html, /前缀 \+ 后缀/);
  assert.match(html, /前缀 \+ 包含 \+ 后缀/);
  assert.match(html, /id="prefixTarget"/);
  assert.match(html, /id="containsTarget"/);
  assert.match(html, /id="suffixTarget"/);
  assert.match(html, /平均多少个出一个/);
  assert.match(renderer, /buildRuleFromInputs/);
});

test('UI starts with no preset target and validates chain-specific rules before running', async () => {
  const html = await readFile('src/renderer/index.html', 'utf8');
  const renderer = await readFile('src/renderer/renderer.js', 'utf8');
  const main = await readFile('src/main.js', 'utf8');

  assert.doesNotMatch(html, /id="suffixTarget" value="8888"/);
  assert.match(renderer, /validateRuleBeforeStart/);
  assert.match(renderer, /TRX 地址使用 Base58 字符/);
  assert.match(renderer, /ETH 规则只能填写十六进制字符/);
  assert.match(main, /resizable:\s*false/);
});

test('UI supports private-key or mnemonic source and selectable TXT save fields', async () => {
  const html = await readFile('src/renderer/index.html', 'utf8');
  const renderer = await readFile('src/renderer/renderer.js', 'utf8');

  assert.match(html, /data-source="private_key"/);
  assert.match(html, /data-source="mnemonic"/);
  assert.match(html, /id="savePrivateKey"/);
  assert.match(html, /id="saveMnemonic"/);
  assert.match(renderer, /generationSource/);
  assert.match(renderer, /saveMnemonic/);
  assert.match(renderer, /updateSaveOptions/);
});

test('UI exposes suffix-only suspicious vanity controls', async () => {
  const html = await readFile('src/renderer/index.html', 'utf8');
  const renderer = await readFile('src/renderer/renderer.js', 'utf8');
  const matching = await readFile('src/core/matching.js', 'utf8');

  assert.match(html, /id="suspiciousEnabled"/);
  assert.match(html, /id="leopardMinLength"/);
  assert.match(html, /id="sequenceMinLength"/);
  assert.match(html, /id="customSuspiciousSuffixes"/);
  assert.match(html, /id="workerBatchSize"/);
  assert.match(renderer, /buildSuspiciousConfig/);
  assert.match(matching, /endsWith/);
  assert.doesNotMatch(matching, /dead|beef|cafe|face|feed/);
});

test('renderer files keep readable Chinese text without mojibake', async () => {
  const html = await readFile('src/renderer/index.html', 'utf8');
  const renderer = await readFile('src/renderer/renderer.js', 'utf8');

  assert.match(html, /靓号地址生成器/);
  assert.match(html, /恢复统计/);
  assert.match(renderer, /已停止/);
  assert.doesNotMatch(html + renderer, /[鏃犻檺闈撶爜]/);
});
