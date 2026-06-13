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
  assert.match(main, /resizable:\s*true/);
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
  assert.match(html, /id="cpuThreadHint"/);
  assert.match(renderer, /buildSuspiciousConfig/);
  assert.match(matching, /endsWith/);
  assert.doesNotMatch(matching, /dead|beef|cafe|face|feed/);
});

test('main app includes generator and vanity filter tabs with working controls', async () => {
  const html = await readFile('src/renderer/index.html', 'utf8');
  const renderer = await readFile('src/renderer/renderer.js', 'utf8');
  const preload = await readFile('src/preload.cjs', 'utf8');
  const main = await readFile('src/main.js', 'utf8');

  assert.match(html, /data-tab="generatorTab"/);
  assert.match(html, /data-tab="filterTab"/);
  assert.match(html, /data-tab="turboTab"/);
  assert.match(html, /id="cpuBoost"/);
  assert.match(html, /id="gpuEnabled"/);
  assert.doesNotMatch(html, /id="gpuEnabled"[^>]*disabled/);
  assert.match(html, /id="matchExample"/);
  assert.match(html, /id="filterLeopardLength"[\s\S]*value="7"[\s\S]*value="8"/);
  assert.match(html, /id="filterExportBtn"/);
  assert.match(renderer, /bindMainTabs/);
  assert.match(renderer, /applyCpuBoostMode/);
  assert.match(renderer, /applyRuntimeConfigLive/);
  assert.match(renderer, /updateCpuThreadHint/);
  assert.match(renderer, /地址\/秒/);
  assert.match(renderer, /updateMatchExample/);
  assert.match(renderer, /bindFilterEvents/);
  assert.match(renderer, /chooseTxtFile/);
  assert.match(renderer, /onSuspiciousHit/);
  assert.match(renderer, /piece === 'abcde'/);
  assert.match(renderer, /piece === 'edcba'/);
  assert.match(preload, /setGpuMonitoring/);
  assert.match(preload, /systemInfo/);
  assert.match(preload, /setRuntimeConfig/);
  assert.match(main, /gpu:monitoring/);
  assert.match(main, /app:system-info/);
  assert.match(main, /session:runtime-config/);
  assert.match(main, /maximizable:\s*true/);
  assert.match(main, /session:suspicious-hit/);
});

test('turbo target mode is isolated from the normal generator', async () => {
  const html = await readFile('src/renderer/index.html', 'utf8');
  const renderer = await readFile('src/renderer/renderer.js', 'utf8');
  const preload = await readFile('src/preload.cjs', 'utf8');
  const main = await readFile('src/main.js', 'utf8');
  const worker = await readFile('src/worker/turbo-worker.js', 'utf8');

  assert.match(html, /id="turboTab"/);
  assert.match(html, /id="turboStartBtn"/);
  assert.match(html, /id="turboEngine"/);
  assert.match(html, /id="turboTargets"/);
  assert.match(html, /id="turboSpeedMode"/);
  assert.match(html, /id="turboResultsBody"/);
  assert.match(renderer, /bindTurboEvents/);
  assert.match(renderer, /startTurbo/);
  assert.match(renderer, /parseTurboTargets/);
  assert.match(renderer, /renderTurboState/);
  assert.match(renderer, /addTurboResultRow/);
  assert.match(preload, /turboStart/);
  assert.match(preload, /onTurboUpdate/);
  assert.match(main, /turbo:start/);
  assert.match(main, /turbo:stop/);
  assert.match(main, /turboWorkers/);
  assert.match(main, /turbo-worker\.js/);
  assert.match(worker, /createWalletCandidate/);
  assert.match(worker, /matchesRule/);
  assert.match(worker, /matchesTurboRule/);
  assert.match(worker, /suffixes/);
  assert.doesNotMatch(worker, /isSuspiciousVanity/);
});

test('filter results keep long values compact and copyable', async () => {
  const renderer = await readFile('src/renderer/renderer.js', 'utf8');
  const css = await readFile('src/renderer/styles.css', 'utf8');

  assert.match(renderer, /data-filter-copy/);
  assert.match(renderer, /copyFilterValue/);
  assert.match(renderer, /filter-value-preview/);
  assert.match(css, /\.filter-table-wrap[\s\S]*overflow-x:\s*hidden/);
  assert.match(css, /\.filter-value-preview[\s\S]*text-overflow:\s*ellipsis/);
  assert.match(css, /\.filter-address[\s\S]*text-overflow:\s*ellipsis/);
});

test('run status updates immediately from control clicks', async () => {
  const renderer = await readFile('src/renderer/renderer.js', 'utf8');

  assert.match(renderer, /function setRunStatus/);
  assert.match(renderer, /setRunStatus\('准备启动'\)/);
  assert.match(renderer, /setRunStatus\('启动中'\)/);
  assert.match(renderer, /setRunStatus\('暂停中'\)/);
  assert.match(renderer, /setRunStatus\('运行中'\)/);
  assert.match(renderer, /setRunStatus\('停止中'\)/);
  assert.match(renderer, /latestState\s*=\s*await window\.vanityApi\.stop\(\)/);
  assert.match(renderer, /stopped:\s*'已停止'/);
});

test('main process and worker report stopped and early stats', async () => {
  const main = await readFile('src/main.js', 'utf8');
  const worker = await readFile('src/worker/generator-worker.js', 'utf8');

  assert.match(main, /publicSessionState\('stopped'\)/);
  assert.match(main, /speed:\s*\{\s*cpu:\s*0,\s*gpu:\s*0,\s*total:\s*0\s*\}/);
  assert.match(worker, /STATS_INTERVAL_MS\s*=\s*250/);
  assert.match(worker, /maybeReportStats/);
  assert.match(worker, /i % 256 === 0/);
});

test('renderer files keep readable Chinese text without mojibake', async () => {
  const html = await readFile('src/renderer/index.html', 'utf8');
  const renderer = await readFile('src/renderer/renderer.js', 'utf8');

  assert.match(html, /靓号地址生成器/);
  assert.match(html, /恢复统计/);
  assert.match(renderer, /已停止/);
  assert.doesNotMatch(html + renderer, /[鏃犻檺闈撶爜]/);
});
