import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { appendFile, mkdir, readFile } from 'node:fs/promises';

import { createCheckpoint, loadCheckpoint, saveCheckpoint } from './core/checkpoint.js';
import { formatPrivateKeyForWallet } from './core/address.js';
import { decryptPrivateKey, encryptPrivateKey } from './core/crypto-store.js';
import { probeGpu } from './main/gpu.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerUrl = new URL('./worker/generator-worker.js', import.meta.url);

let mainWindow;
let workers = [];
let session = null;
let checkpointTimer = null;
let gpuTimer = null;
let gpuMonitoringEnabled = true;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    resizable: false,
    maximizable: false,
    backgroundColor: '#050808',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  gpuTimer = setInterval(async () => {
    if (gpuMonitoringEnabled) {
      mainWindow?.webContents.send('gpu:update', await probeGpu());
    }
  }, 2000);
});

app.on('window-all-closed', () => {
  stopSession();
  if (gpuTimer) clearInterval(gpuTimer);
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:checkpoint', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Checkpoint', extensions: ['json'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:txt', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Text', extensions: ['txt', 'log', 'csv'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  return {
    path: filePath,
    content: await readFile(filePath, 'utf8'),
  };
});

ipcMain.handle('app:default-folders', async () => {
  const base = join(app.getPath('documents'), 'TRX_ETH_Vanity_Results');
  return {
    resultsDir: join(base, 'results'),
    suspiciousDir: join(base, 'results', 'suspicious'),
  };
});

function checkpointPath() {
  return join(app.getPath('userData'), 'checkpoint.json');
}

ipcMain.handle('session:start', async (_event, config) => {
  stopSession();
  const startedAt = new Date().toISOString();
  session = {
    config,
    startedAt,
    elapsedBeforeStartMs: config.resume?.elapsedMs ?? 0,
    startClockMs: Date.now(),
    attempts: config.resume?.attempts ?? 0,
    results: config.resume?.results ?? [],
    suspiciousCount: config.resume?.suspiciousCount ?? 0,
    lastCheckpointAt: null,
    speed: { cpu: 0, gpu: 0, total: 0 },
    workerSpeeds: new Map(),
    encryptedKeysById: new Map(),
    privateKeysById: new Map(),
  };

  await ensureFolders(config);
  checkpointTimer = setInterval(() => writeCheckpoint(), 5000);

  const threadCount = Math.max(1, Math.min(Number(config.cpuThreads) || 1, 64));
  for (let i = 0; i < threadCount; i += 1) {
    const worker = new Worker(workerUrl, {
      workerData: { config, workerIndex: i },
    });
    worker.on('message', (message) => handleWorkerMessage(message));
    worker.on('error', (error) => mainWindow?.webContents.send('session:error', error.message));
    workers.push(worker);
  }

  mainWindow?.webContents.send('session:started', publicSessionState());
  return publicSessionState();
});

ipcMain.handle('session:pause', async () => {
  workers.forEach((worker) => worker.postMessage({ type: 'pause' }));
  await writeCheckpoint();
  return publicSessionState('paused');
});

ipcMain.handle('session:resume', async () => {
  workers.forEach((worker) => worker.postMessage({ type: 'resume' }));
  return publicSessionState('running');
});

ipcMain.handle('session:stop', async () => {
  await writeCheckpoint();
  stopSession();
  return { stopped: true };
});

ipcMain.handle('session:clear', async () => {
  if (!session) return null;
  session.attempts = 0;
  session.results = [];
  session.suspiciousCount = 0;
  session.elapsedBeforeStartMs = 0;
  session.startClockMs = Date.now();
  await writeCheckpoint();
  return publicSessionState();
});

ipcMain.handle('checkpoint:load', async (_event, checkpointPath) => loadCheckpoint(checkpointPath));

ipcMain.handle('open:path', async (_event, targetPath) => {
  await mkdir(targetPath, { recursive: true });
  await shell.openPath(targetPath);
});

ipcMain.handle('open:external', async (_event, url) => {
  if (url !== 'https://t.me/nbb111222') {
    throw new Error('External URL is not allowed');
  }
  await shell.openExternal(url);
});

ipcMain.handle('gpu:monitoring', async (_event, enabled) => {
  gpuMonitoringEnabled = Boolean(enabled);
  if (!gpuMonitoringEnabled) {
    mainWindow?.webContents.send('gpu:update', {
      name: '监控已关闭',
      utilization: 0,
      memoryUsedMb: 0,
      memoryTotalMb: 0,
      temperatureC: 0,
      powerW: 0,
    });
  } else {
    mainWindow?.webContents.send('gpu:update', await probeGpu());
  }
  return { enabled: gpuMonitoringEnabled };
});

ipcMain.handle('clipboard:copy', async (_event, text) => {
  clipboard.writeText(String(text ?? ''));
  return { copied: true };
});

ipcMain.handle('private-key:get', async (_event, payload) => getPrivateKey(payload));

ipcMain.handle('private-key:decrypt', async (_event, payload) => getPrivateKey(payload));

async function getPrivateKey({ resultId, password = '' }) {
  if (!session) throw new Error('No active session');
  if (session.privateKeysById.has(resultId)) {
    return session.privateKeysById.get(resultId);
  }
  const record = session.encryptedKeysById.get(resultId);
  if (record) {
    return decryptPrivateKey(record, password);
  }
  const found = session.results.find((item) => item.id === resultId);
  if (found?.plainPrivateKey) return found.plainPrivateKey;
  const savedRecord = await findSavedPrivateKeyRecord(resultId);
  if (savedRecord?.plainPrivateKey) return savedRecord.plainPrivateKey;
  if (savedRecord?.privateKey) return decryptPrivateKey(savedRecord.privateKey, password);
  throw new Error('Private key record not found in current session or result file');
}

async function handleWorkerMessage(message) {
  if (!session) return;

  if (message.type === 'stats') {
    session.attempts += message.attempts;
    session.workerSpeeds.set(message.workerIndex, message.addrPerSec);
    session.speed.cpu = Array.from(session.workerSpeeds.values()).reduce((sum, value) => sum + value, 0);
    session.speed.total = session.speed.cpu + session.speed.gpu;
    mainWindow?.webContents.send('session:update', publicSessionState());
  }

  if (message.type === 'target-hit') {
    await saveHit(message.hit, false);
    await writeCheckpoint();
    if (shouldStopAfterTarget()) {
      stopSession();
      mainWindow?.webContents.send('session:update', publicSessionState('completed'));
    }
  }

  if (message.type === 'suspicious-hit') {
    await saveHit(message.hit, true);
  }
}

async function saveHit(hit, suspicious) {
  const now = new Date().toISOString();
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const result = {
    id,
    chain: hit.chain,
    address: hit.address,
    rule: hit.rule,
    generatedAt: now,
    attempts: session.attempts + hit.localAttempts,
    elapsedMs: currentElapsedMs(),
    isTarget: !suspicious,
    isSuspicious: suspicious,
    saveStatus: 'saved',
    keyEncrypted: false,
    mnemonic: hit.mnemonic,
    derivationPath: hit.derivationPath,
  };
  const walletPrivateKey = formatPrivateKeyForWallet(hit.chain, hit.privateKey);

  if (session.config.encryptPrivateKeys) {
    const encryptedPrivateKey = await encryptPrivateKey(walletPrivateKey, session.config.masterPassword);
    session.encryptedKeysById.set(id, encryptedPrivateKey);
    result.privateKey = encryptedPrivateKey;
    result.keyEncrypted = true;
  } else {
    result.plainPrivateKey = walletPrivateKey;
  }
  session.privateKeysById.set(id, walletPrivateKey);

  const targetDir = suspicious ? session.config.suspiciousDir : session.config.resultsDir;
  const file = join(targetDir, suspicious ? 'suspicious.txt' : 'results.txt');
  await appendFile(file, formatTxtResultLine({
    address: hit.address,
    privateKey: walletPrivateKey,
    mnemonic: hit.mnemonic,
    savePrivateKey: session.config.savePrivateKey !== false,
    saveMnemonic: Boolean(session.config.saveMnemonic && hit.mnemonic),
  }), 'utf8');

  if (suspicious) {
    session.suspiciousCount += 1;
    mainWindow?.webContents.send('session:suspicious-hit', {
      chain: hit.chain,
      address: hit.address,
      privateKey: walletPrivateKey,
      mnemonic: hit.mnemonic || '',
      rule: hit.rule,
      generatedAt: now,
      attempts: result.attempts,
    });
  } else {
    session.results.push(stripPrivateKey(result));
  }

  mainWindow?.webContents.send('session:hit', {
    result: stripPrivateKey(result),
    suspiciousCount: session.suspiciousCount,
  });
}

async function writeCheckpoint() {
  if (!session?.config?.autoSave) return;
  const checkpointFile = checkpointPath();
  const checkpoint = createCheckpoint({
    config: { ...session.config, masterPassword: undefined, resume: undefined },
    attempts: session.attempts,
    startedAt: session.startedAt,
    elapsedMs: currentElapsedMs(),
    results: session.results,
    suspiciousCount: session.suspiciousCount,
    stats: session.speed,
  });
  await saveCheckpoint(checkpointFile, checkpoint);
  session.lastCheckpointAt = checkpoint.savedAt;
  mainWindow?.webContents.send('checkpoint:saved', {
    checkpointPath: checkpointFile,
    savedAt: new Date().toISOString(),
  });
}

function stopSession() {
  workers.forEach((worker) => worker.terminate());
  workers = [];
  if (checkpointTimer) clearInterval(checkpointTimer);
  checkpointTimer = null;
}

async function ensureFolders(config) {
  await mkdir(config.resultsDir, { recursive: true });
  await mkdir(config.suspiciousDir, { recursive: true });
}

function currentElapsedMs() {
  if (!session) return 0;
  return session.elapsedBeforeStartMs + Date.now() - session.startClockMs;
}

function publicSessionState(status = 'running') {
  if (!session) return null;
  return {
    status,
    attempts: session.attempts,
    elapsedMs: currentElapsedMs(),
    results: session.results,
    suspiciousCount: session.suspiciousCount,
    speed: session.speed,
    lastCheckpointAt: session.lastCheckpointAt,
  };
}

function stripPrivateKey(result) {
  const { privateKey, plainPrivateKey, ...safe } = result;
  return safe;
}

function formatTxtResultLine({ address, privateKey, mnemonic, savePrivateKey, saveMnemonic }) {
  const parts = [address];
  if (savePrivateKey) parts.push(privateKey);
  if (saveMnemonic) parts.push(mnemonic);
  return `${parts.join(' ')}\n`;
}

function shouldStopAfterTarget() {
  const raw = String(session.config.targetCount ?? '').trim();
  if (!raw || raw === '无限') return false;
  const targetCount = Number(raw);
  return Number.isFinite(targetCount) && targetCount > 0 && session.results.length >= targetCount;
}

async function findSavedPrivateKeyRecord(resultId) {
  if (!session?.config?.resultsDir) return null;
  return null;
}
