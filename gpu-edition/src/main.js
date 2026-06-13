import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { appendFile, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = dirname(__dirname);
const SEQUENCES = ['123456', '1234567', '12345678', '1234567890', '012345', '987654', '654321'];

let mainWindow;
let session = null;
let processes = [];
let timer = null;
let seenSuspicious = new Set();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 760,
    minWidth: 1040,
    minHeight: 660,
    backgroundColor: '#020807',
    title: 'TRX / ETH GPU Vanity Generator',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  stopCurrent();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('system:info', async () => ({
  cpu: `${os.cpus()[0]?.model || 'CPU'} / ${os.cpus().length} threads / ${Math.round(os.totalmem() / 1024 / 1024).toLocaleString('zh-CN')} MB`,
  resultsDir: join(appRoot, 'results'),
  gpu: await gpuInfo(),
}));

ipcMain.handle('folder:choose', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('folder:open', async (_event, folder) => {
  if (folder) await shell.openPath(folder);
});

ipcMain.handle('scan:start', async (_event, config) => {
  stopCurrent();
  await mkdir(config.resultsDir, { recursive: true });
  session = {
    config: normalizeConfig(config),
    status: 'starting',
    detail: 'starting',
    startedAt: Date.now(),
    lastClock: Date.now(),
    speed: 0,
    attempts: 0,
    targetHits: 0,
    suspiciousHits: 0,
    pendingEthAddress: '',
  };
  if (session.config.chain === 'TRX') await startTrx(session.config);
  if (session.config.chain === 'ETH') await startEth(session.config);
  timer = setInterval(tick, 1000);
  sendState();
  return state();
});

ipcMain.handle('scan:stop', async () => {
  const current = state('stopped');
  stopCurrent();
  return current;
});

async function startTrx(config) {
  const baseDir = join(appRoot, 'core', 'trx-gpu');
  if (!existsSync(join(baseDir, 'gpu.exe'))) throw new Error(`Missing TRX GPU core: ${baseDir}`);
  const runtimeRoot = join(appRoot, 'runtime');
  await rm(runtimeRoot, { recursive: true, force: true });
  await mkdir(runtimeRoot, { recursive: true });

  const targets = parseTargets(config.targets);
  const groups = groupTrxTargets(config.mode, targets);
  for (const group of groups) {
    const dir = await makeTrxRuntime(baseDir, join(runtimeRoot, `target-${group.label}`));
    await writeFile(join(dir, 'diy.txt'), `${group.patterns.join('\n')}\n`, 'utf8');
    spawnTracked({
      chain: 'TRX',
      kind: 'target',
      cwd: dir,
      file: join(dir, 'gpu.exe'),
      args: ['--gaofang', 'diy.txt', '--qian', String(group.qian), '--hou', String(group.hou)],
    });
  }

  if (config.suspiciousLeopard) {
    const dir = await makeTrxRuntime(baseDir, join(runtimeRoot, 'suspicious-leopard'));
    spawnTracked({
      chain: 'TRX',
      kind: 'suspicious',
      cwd: dir,
      file: join(dir, 'gpu.exe'),
      args: ['--lianhao', 'yes', '--hou', String(config.leopardMin)],
    });
  }

  if (config.suspiciousSequence) {
    const dir = await makeTrxRuntime(baseDir, join(runtimeRoot, 'suspicious-sequence'));
    spawnTracked({
      chain: 'TRX',
      kind: 'suspicious',
      cwd: dir,
      file: join(dir, 'gpu.exe'),
      args: ['--shunzi', 'yes', '--hou', '6'],
    });
  }
}

async function startEth(config) {
  const dir = join(appRoot, 'core', 'eth-gpu');
  const exe = join(dir, 'oclvanitygen++.exe');
  if (!existsSync(exe)) throw new Error(`Missing ETH GPU core: ${exe}`);

  const patterns = parseTargets(config.targets).map((target) => buildEthPattern(config.mode, target));
  if (config.suspiciousLeopard) {
    patterns.push(...buildEthLeopardPatterns(config));
  }
  if (config.suspiciousSequence) {
    patterns.push(...SEQUENCES.map((seq) => `*${seq}`));
  }
  await writeFile(join(dir, 'patterns.txt'), `${Array.from(new Set(patterns)).join('\n')}\n`, 'utf8');
  spawnTracked({
    chain: 'ETH',
    kind: 'target',
    cwd: dir,
    file: exe,
    args: ['-C', 'ETH', '-i', '-k', '-f', 'patterns.txt'],
  });
}

async function makeTrxRuntime(baseDir, dir) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const file of ['gpu.exe', 'opencl.dll', 'vcruntime140_1.dll', 'cache-opencl.255.65536']) {
    const source = join(baseDir, file);
    if (existsSync(source)) await cp(source, join(dir, file), { force: true });
  }
  return dir;
}

function spawnTracked(meta) {
  const child = spawn(meta.file, meta.args, { cwd: meta.cwd, windowsHide: true });
  const tracked = { ...meta, child, buffer: '', speed: 0, seenFiles: new Set() };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => handleOutput(tracked, chunk));
  child.stderr.on('data', (chunk) => handleOutput(tracked, chunk));
  child.on('exit', () => {
    tracked.exited = true;
    tracked.speed = 0;
    if (session && processes.every((item) => item.exited)) {
      session.status = 'stopped';
      session.detail = 'stopped';
      sendState();
    }
  });
  processes.push(tracked);
}

function handleOutput(proc, chunk) {
  const text = clean(chunk);
  if (session && text.trim()) {
    session.status = 'running';
    session.detail = session.speed > 0 ? session.detail : 'running';
  }
  updateSpeed(proc, text);
  updateProgress(text);
  proc.buffer += text;
  const lines = proc.buffer.split(/\r?\n/);
  proc.buffer = lines.pop() || '';
  for (const line of lines) {
    const hit = proc.chain === 'ETH' ? parseEthHit(line) : parseTrxHit(line);
    if (hit) classifyAndSave(proc.chain, hit);
  }
}

function updateSpeed(proc, text) {
  if (!session) return;
  const matches = [...text.matchAll(/([0-9.]+)\s*([MGK])(?:key|H)?\/s/gi)];
  const last = matches.at(-1);
  if (!last) return;
  accrue();
  const unit = last[2].toUpperCase();
  const scale = unit === 'G' ? 1_000_000_000 : unit === 'M' ? 1_000_000 : 1_000;
  proc.speed = Math.round(Number(last[1]) * scale);
  session.speed = processes.reduce((sum, item) => sum + (item.speed || 0), 0);
  session.status = 'running';
  session.detail = `running ${(session.speed / 1_000_000).toFixed(3)} M/s`;
  sendState();
}

function updateProgress(text) {
  if (!session) return;
  const progress = text.match(/(\d+)%/g)?.at(-1);
  if (progress && session.speed === 0) {
    session.status = 'starting';
    session.detail = `GPU loading ${progress}`;
    sendState();
  }
}

function parseTrxHit(line) {
  const match = line.match(/key:([0-9a-f]{64}).*?(T[1-9A-HJ-NP-Za-km-z]{33})/i);
  if (!match) return null;
  return { privateKey: match[1].toLowerCase(), address: match[2] };
}

function parseSavedTrxHit(line) {
  const match = line.match(/Key[:：]\s*([0-9a-f]{64}).*?Address[:：]\s*(T[1-9A-HJ-NP-Za-km-z]{33})/i);
  if (!match) return null;
  return { privateKey: match[1].toLowerCase(), address: match[2] };
}

function parseEthHit(line) {
  if (/ETH Address:/i.test(line)) {
    session.pendingEthAddress = line.match(/0x[0-9a-fA-F]{40}/)?.[0] || '';
    return null;
  }
  if (/ETH Privkey:/i.test(line)) {
    const privateKey = line.match(/0x[0-9a-fA-F]{64}/)?.[0]?.replace(/^0x/i, '').toLowerCase();
    if (session.pendingEthAddress && privateKey) {
      const hit = { address: session.pendingEthAddress, privateKey };
      session.pendingEthAddress = '';
      return hit;
    }
  }
  return null;
}

async function classifyAndSave(chain, hit) {
  if (!session) return;
  const suspicious = suspiciousRule(chain, hit.address, session.config);
  const target = matchesTarget(chain, hit.address, session.config);
  if (suspicious) {
    await saveHit('suspicious', chain, hit, suspicious, 'suspicious.txt');
  }
  if (target) {
    await saveHit('target', chain, hit, target, 'target.txt');
  }
}

async function saveHit(kind, chain, hit, rule, fileName) {
  if (!session) return;
  const id = `${kind}|${hit.address}|${hit.privateKey}`;
  if (kind === 'suspicious' && seenSuspicious.has(id)) return;
  if (kind === 'suspicious') seenSuspicious.add(id);
  await appendFile(join(session.config.resultsDir, fileName), `${hit.address} ${hit.privateKey}\n`, 'utf8');
  if (kind === 'target') session.targetHits += 1;
  if (kind === 'suspicious') session.suspiciousHits += 1;
  mainWindow?.webContents.send('scan:hit', {
    kind,
    chain,
    address: hit.address,
    privateKey: hit.privateKey,
    rule,
    fileName,
  });
  sendState();
}

async function syncSuspiciousFiles() {
  if (!session || session.config.chain !== 'TRX') return;
  for (const proc of processes.filter((item) => item.kind === 'suspicious')) {
    const files = (await readdir(proc.cwd).catch(() => [])).filter((name) => /\.txt$/i.test(name));
    for (const file of files) {
      if (/diy|address|说明/i.test(file)) continue;
      const text = await readFile(join(proc.cwd, file), 'utf8').catch(() => '');
      for (const line of text.split(/\r?\n/)) {
        const hit = parseSavedTrxHit(line);
        if (!hit) continue;
        const rule = suspiciousRule('TRX', hit.address, session.config);
        if (rule) await saveHit('suspicious', 'TRX', hit, rule, 'suspicious.txt');
      }
    }
  }
}

function suspiciousRule(chain, address, config) {
  const tail = comparable(chain, address);
  const leopard = leopardTail(tail, config.leopardMin);
  if (leopard) {
    const isDigit = /^[0-9]+$/.test(leopard);
    const isLetter = /^[a-z]+$/i.test(leopard);
    if ((isDigit && config.leopardDigits) || (isLetter && config.leopardLetters)) {
      return `疑似豹子${leopard.length}:${leopard}`;
    }
  }
  const seq = SEQUENCES.find((item) => tail.endsWith(item));
  if (config.suspiciousSequence && seq) return `疑似顺子:${seq}`;
  return '';
}

function leopardTail(value, minLength) {
  if (!minLength || value.length < minLength) return '';
  const last = value.at(-1);
  let count = 0;
  for (let i = value.length - 1; i >= 0 && value[i].toLowerCase() === last.toLowerCase(); i -= 1) count += 1;
  return count >= minLength ? value.slice(-count) : '';
}

function matchesTarget(chain, address, config) {
  const value = comparable(chain, address);
  for (const target of parseTargets(config.targets)) {
    const normalized = chain === 'ETH' ? target.replace(/^0x/i, '').toLowerCase() : target.toLowerCase();
    if (config.mode === 'suffix' && value.endsWith(normalized)) return `目标后缀:${target}`;
    if (config.mode === 'prefix' && value.startsWith(normalized)) return `目标前缀:${target}`;
    if (config.mode === 'contains' && value.includes(normalized)) return `目标包含:${target}`;
    if (config.mode === 'prefix_suffix') {
      const [prefix = '', suffix = ''] = normalized.split('|');
      if ((!prefix || value.startsWith(prefix)) && (!suffix || value.endsWith(suffix))) return `目标前后缀:${target}`;
    }
  }
  return '';
}

function comparable(chain, address) {
  const lower = String(address).toLowerCase();
  return chain === 'ETH' ? lower.replace(/^0x/, '') : lower.slice(1);
}

function tick() {
  accrue();
  syncSuspiciousFiles();
  sendState();
}

function accrue() {
  if (!session) return;
  const now = Date.now();
  const elapsed = now - session.lastClock;
  session.lastClock = now;
  if (session.speed > 0 && elapsed > 0) session.attempts += Math.round((session.speed * elapsed) / 1000);
}

function stopCurrent() {
  if (timer) clearInterval(timer);
  timer = null;
  for (const proc of processes) {
    if (proc.child?.pid) execFile('taskkill', ['/PID', String(proc.child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  }
  processes = [];
  session = null;
}

function state(forcedStatus) {
  if (!session) {
    return { status: forcedStatus || 'stopped', detail: 'stopped', speed: 0, attempts: 0, targetHits: 0, suspiciousHits: 0, elapsedMs: 0 };
  }
  return {
    status: forcedStatus || session.status,
    detail: session.detail,
    speed: session.speed,
    attempts: session.attempts,
    targetHits: session.targetHits,
    suspiciousHits: session.suspiciousHits,
    elapsedMs: Date.now() - session.startedAt,
  };
}

function sendState() {
  mainWindow?.webContents.send('scan:update', state());
}

function normalizeConfig(config) {
  return {
    ...config,
    leopardMin: Math.max(5, Math.min(Number(config.leopardMin) || 5, 10)),
    leopardDigits: config.leopardDigits !== false,
    leopardLetters: config.leopardLetters !== false,
    suspiciousLeopard: config.suspiciousLeopard !== false,
    suspiciousSequence: config.suspiciousSequence !== false,
  };
}

function parseTargets(value) {
  return String(value || '').split(/[\s,，;；]+/).map((item) => item.trim()).filter(Boolean);
}

function groupTrxTargets(mode, targets) {
  if (mode === 'suffix') {
    const byLength = new Map();
    for (const target of targets) {
      const list = byLength.get(target.length) || [];
      list.push(`${'T'.repeat(Math.max(0, 20 - target.length))}${target}`);
      byLength.set(target.length, list);
    }
    return Array.from(byLength.entries()).map(([length, patterns]) => ({
      label: `suffix-${length}`,
      patterns,
      qian: 0,
      hou: length,
    }));
  }
  const maxLen = Math.max(...targets.map((item) => item.length), 1);
  return [{
    label: mode,
    patterns: targets.map((target) => buildTrxPattern(mode, target)),
    qian: mode === 'prefix' || mode === 'prefix_suffix' ? maxLen : 0,
    hou: mode === 'prefix' ? 0 : maxLen,
  }];
}

function buildTrxPattern(mode, target) {
  if (mode === 'prefix') return `${target}${'T'.repeat(Math.max(0, 20 - target.length))}`;
  if (mode === 'prefix_suffix') {
    const [prefix = '', suffix = ''] = target.split('|');
    return `${prefix}${'T'.repeat(Math.max(0, 20 - prefix.length - suffix.length))}${suffix}`;
  }
  return `${'T'.repeat(Math.max(0, 20 - target.length))}${target}`;
}

function buildEthPattern(mode, target) {
  const cleanTarget = target.replace(/^0x/i, '');
  if (mode === 'prefix') return `0x${cleanTarget}`;
  if (mode === 'suffix') return `*${cleanTarget}`;
  if (mode === 'contains') return `*${cleanTarget}*`;
  if (mode === 'prefix_suffix') {
    const [prefix = '', suffix = ''] = cleanTarget.split('|');
    return `0x${prefix}*${suffix}`;
  }
  return `*${cleanTarget}`;
}

function buildEthLeopardPatterns(config) {
  const chars = [];
  if (config.leopardDigits) chars.push(...'0123456789');
  if (config.leopardLetters) chars.push(...'abcdef');
  return chars.map((char) => `*${char.repeat(config.leopardMin)}`);
}

function clean(value) {
  return String(value).replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function gpuInfo() {
  return new Promise((resolve) => {
    execFile('nvidia-smi', ['--query-gpu=name,driver_version', '--format=csv,noheader'], { windowsHide: true }, (error, stdout) => {
      resolve(error ? 'No NVIDIA GPU detected' : stdout.trim());
    });
  });
}
