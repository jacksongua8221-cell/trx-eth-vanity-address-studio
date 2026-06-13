let chain = 'TRX';
let generationSource = 'private_key';
let latestState = null;
let resumeCheckpoint = null;
let difficulty = { probability: 0, difficulty: Infinity };
let filterSource = 'sync';
let filterActiveCategory = 'ALL';
let filterItems = [];
let filterVisible = [];
let latestTurboState = null;
let turboPrivateKeys = new Map();
let systemInfo = { logicalCores: 4, recommendedThreads: 4, totalMemoryMb: 0, cpuModel: '检测中' };

const els = Object.fromEntries(
  Array.from(document.querySelectorAll('[id]')).map((el) => [el.id, el])
);
systemInfo.maxRecommendedThreads = systemInfo.logicalCores;
systemInfo.cpuModel = '检测中';

init();

async function init() {
  const folders = await window.vanityApi.defaultFolders();
  systemInfo = await window.vanityApi.systemInfo();
  systemInfo.maxRecommendedThreads = systemInfo.maxRecommendedThreads || systemInfo.logicalCores || systemInfo.recommendedThreads || 1;
  els.resultsDir.value = folders.resultsDir;
  els.suspiciousDir.value = folders.suspiciousDir;
  els.turboResultsDir.value = folders.resultsDir;
  els.cpuModel.textContent = systemInfo.cpuModel;
  els.systemMemory.textContent = `${formatNumber(systemInfo.totalMemoryMb)} MB`;
  els.cpuThreads.value = String(systemInfo.recommendedThreads);
  updateCpuThreadHint();
  bindEvents();
  refreshDifficulty();
  setInterval(() => latestState && renderState(latestState), 1000);
}

function bindEvents() {
  document.querySelectorAll('[data-chain]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-chain]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      chain = button.dataset.chain;
      updateMatchExample();
      refreshDifficulty();
    });
  });
  document.querySelectorAll('[data-source]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-source]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      generationSource = button.dataset.source;
      updateSaveOptions();
    });
  });

  ['matchMode', 'prefixTarget', 'containsTarget', 'suffixTarget'].forEach((id) => {
    els[id].addEventListener('input', () => {
      updateTargetInputs();
      updateMatchExample();
      refreshDifficulty();
    });
  });
  updateTargetInputs();
  updateSaveOptions();
  updateMatchExample();
  applyCpuBoostMode();
  bindMainTabs();
  bindFilterEvents();
  bindTurboEvents();
  els.encryptPrivateKeys.addEventListener('change', () => {
    const encrypted = els.encryptPrivateKeys.checked;
    els.plainWarning.classList.toggle('hidden', encrypted);
    els.masterPassword.disabled = !encrypted;
    els.masterPassword.placeholder = encrypted ? '加密保存和查看私钥使用' : '仅打开加密保存时需要';
  });
  els.masterPassword.disabled = !els.encryptPrivateKeys.checked;
  els.chooseResults.addEventListener('click', () => chooseFolder(els.resultsDir));
  els.chooseSuspicious.addEventListener('click', () => chooseFolder(els.suspiciousDir));
  els.autoThreadsBtn.addEventListener('click', async () => {
    els.cpuThreads.value = String(systemInfo.recommendedThreads);
    applyCpuBoostMode();
    await applyRuntimeConfigLive();
  });
  els.cpuThreads.addEventListener('input', applyRuntimeConfigLive);
  els.workerBatchSize.addEventListener('input', applyRuntimeConfigLive);
  els.cpuBoost.addEventListener('change', async () => {
    applyCpuBoostMode();
    await applyRuntimeConfigLive();
  });
  els.cpuBoostMode.addEventListener('change', async () => {
    applyCpuBoostMode();
    await applyRuntimeConfigLive();
  });
  els.gpuEnabled.addEventListener('change', async () => {
    await window.vanityApi.setGpuMonitoring(els.gpuEnabled.checked);
    els.gpuHint.textContent = els.gpuEnabled.checked
      ? 'GPU 仅做状态监控，当前版本生成任务由 CPU 多线程执行。'
      : 'GPU 状态监控已关闭，生成任务继续由 CPU 多线程执行。';
  });
  els.startBtn.addEventListener('click', start);
  els.restoreBtn.addEventListener('click', restoreCheckpoint);
  els.tgLink.addEventListener('click', () => window.vanityApi.openExternal('https://t.me/nbb111222'));
  els.closeKeyModal.addEventListener('click', hidePrivateKeyModal);
  els.copyPrivateKeyBtn.addEventListener('click', copyPrivateKeyFromModal);
  els.pauseBtn.addEventListener('click', async () => {
    setRunStatus('暂停中');
    latestState = await window.vanityApi.pause();
    renderState(latestState);
  });
  els.resumeBtn.addEventListener('click', async () => {
    setRunStatus('运行中');
    latestState = await window.vanityApi.resume();
    renderState(latestState);
  });
  els.stopBtn.addEventListener('click', async () => {
    setRunStatus('停止中');
    latestState = await window.vanityApi.stop();
    renderState(latestState);
  });
  els.clearBtn.addEventListener('click', async () => {
    latestState = await window.vanityApi.clear();
    renderState(latestState);
    renderResults([]);
  });
  els.openResultsBtn.addEventListener('click', () => window.vanityApi.openPath(els.resultsDir.value));
  els.openSuspiciousBtn.addEventListener('click', () => window.vanityApi.openPath(els.suspiciousDir.value));

  window.vanityApi.onSessionStarted((state) => {
    latestState = state;
    renderState(state);
    renderResults(state.results);
  });
  window.vanityApi.onSessionUpdate((state) => {
    latestState = state;
    renderState(state);
  });
  window.vanityApi.onHit(({ result, suspiciousCount }) => {
    if (!result.isSuspicious) addResultRow(result);
    els.suspiciousCount.textContent = String(suspiciousCount);
  });
  window.vanityApi.onSuspiciousHit((item) => {
    if (filterSource !== 'sync') return;
    addFilterItem(item, '实时同步');
    applyFilter();
  });
  window.vanityApi.onCheckpoint(({ savedAt }) => {
    els.checkpointTime.textContent = new Date(savedAt).toLocaleTimeString();
  });
  window.vanityApi.onGpu(renderGpu);
  window.vanityApi.onTurboUpdate((state) => {
    latestTurboState = state;
    renderTurboState(state);
  });
  window.vanityApi.onTurboHit((result) => {
    addTurboResultRow(result);
  });
  window.vanityApi.onTurboError((message) => {
    els.turboStatus.textContent = `错误：${message}`;
  });
  window.vanityApi.onError((message) => {
    setRunStatus(`错误：${message}`);
  });
}

function setRunStatus(label) {
  els.runStatus.textContent = label;
}

async function chooseFolder(input) {
  const folder = await window.vanityApi.chooseFolder();
  if (folder) input.value = folder;
}

async function start() {
  setRunStatus('准备启动');
  const ruleValidation = validateRuleBeforeStart();
  if (!ruleValidation.valid) {
    setRunStatus('待机');
    alert(ruleValidation.message);
    return;
  }
  if (els.encryptPrivateKeys.checked && els.masterPassword.value.length < 8) {
    setRunStatus('待机');
    alert('开启加密保存时，请设置至少 8 位主密码。关闭加密保存则不需要密码。');
    return;
  }
  if (!els.savePrivateKey.checked && !(generationSource === 'mnemonic' && els.saveMnemonic.checked)) {
    setRunStatus('待机');
    alert('请至少选择一种 TXT 保存内容：私钥或助记词。');
    return;
  }
  if (!els.encryptPrivateKeys.checked) {
    const ok = confirm('风险提示：当前未开启加密保存，私钥会明文写入本地文件。确定继续吗？');
    if (!ok) {
      setRunStatus('待机');
      return;
    }
  }

  const runtime = cpuRuntimeConfig();
  const config = {
    chain,
    matchMode: els.matchMode.value,
    target: legacyTargetForMode(),
    rule: buildRuleFromInputs(),
    generationSource,
    savePrivateKey: els.savePrivateKey.checked,
    saveMnemonic: els.saveMnemonic.checked && generationSource === 'mnemonic',
    targetCount: els.targetCount.value.trim(),
    cpuThreads: runtime.cpuThreads,
    batchSize: runtime.batchSize,
    gpuEnabled: els.gpuEnabled.checked,
    suspicious: buildSuspiciousConfig(),
    autoSave: els.autoSave.checked,
    encryptPrivateKeys: els.encryptPrivateKeys.checked,
    masterPassword: els.masterPassword.value,
    suspiciousDir: els.suspiciousDir.value,
    resultsDir: els.resultsDir.value,
    resume: resumeCheckpoint,
  };
  setRunStatus('启动中');
  latestState = await window.vanityApi.start(config);
  resumeCheckpoint = null;
  setRunStatus('运行中');
}

async function restoreCheckpoint() {
  const checkpointPath = await window.vanityApi.chooseCheckpoint();
  if (!checkpointPath) return;
  const checkpoint = await window.vanityApi.loadCheckpoint(checkpointPath);
  resumeCheckpoint = checkpoint;
  chain = checkpoint.config.chain || 'TRX';
  document.querySelectorAll('[data-chain]').forEach((button) => {
    button.classList.toggle('active', button.dataset.chain === chain);
  });
  els.matchMode.value = checkpoint.config.matchMode || checkpoint.config.mode || 'suffix';
  const rule = checkpoint.config.rule ?? checkpoint.config;
  els.prefixTarget.value = rule.prefix || '';
  els.containsTarget.value = rule.contains || '';
  els.suffixTarget.value = rule.suffix || checkpoint.config.target || '';
  els.resultsDir.value = checkpoint.config.resultsDir || els.resultsDir.value;
  els.suspiciousDir.value = checkpoint.config.suspiciousDir || els.suspiciousDir.value;
  restoreSuspiciousConfig(checkpoint.config.suspicious);
  if (checkpoint.config.batchSize) els.workerBatchSize.value = checkpoint.config.batchSize;
  latestState = {
    status: 'restored',
    attempts: checkpoint.attempts,
    elapsedMs: checkpoint.elapsedMs,
    results: checkpoint.results,
    suspiciousCount: checkpoint.suspiciousCount,
    speed: checkpoint.stats || { cpu: 0, gpu: 0, total: 0 },
    lastCheckpointAt: checkpoint.savedAt,
  };
  renderResults(checkpoint.results);
  renderState(latestState);
  updateTargetInputs();
  refreshDifficulty();
  setRunStatus('已恢复');
}

function renderState(state) {
  if (!state) return;
  const elapsed = state.elapsedMs || 0;
  const totalSpeed = state.speed?.total || 0;
  const avgSpeed = elapsed > 0 ? Math.round((state.attempts * 1000) / elapsed) : 0;
  const prob = cumulativeHitProbability(difficulty.probability, state.attempts);
  const estimates = estimateHitTimes(difficulty.difficulty, totalSpeed || avgSpeed);
  const averageCount = Number.isFinite(difficulty.difficulty) ? Math.round(difficulty.difficulty) : Infinity;

  const statusText = {
    paused: '已暂停',
    completed: '已完成',
    restored: '已恢复',
    stopped: '已停止',
    running: '运行中',
  };
  setRunStatus(statusText[state.status] || '运行中');
  els.cpuSpeed.textContent = `${formatNumber(state.speed?.cpu || 0)} 地址/秒`;
  els.gpuSpeed.textContent = state.speed?.gpu ? `${formatNumber(state.speed.gpu)} 地址/秒` : '状态监控';
  els.totalSpeed.textContent = `${formatNumber(totalSpeed)} 地址/秒`;
  els.attempts.textContent = formatNumber(state.attempts);
  els.avgSpeed.textContent = `${formatNumber(avgSpeed)} 地址/秒`;
  els.runtime.textContent = formatDuration(elapsed);
  els.oneIn.textContent = Number.isFinite(averageCount) ? `${formatNumber(averageCount)} 个` : '-';
  els.attemptRatio.textContent = `${formatNumber(state.attempts)} / ${Number.isFinite(averageCount) ? formatNumber(averageCount) : '-'}`;
  els.probability.textContent = `${(prob * 100).toFixed(prob < 0.01 ? 4 : 2)}%`;
  els.probabilityFill.style.width = `${Math.min(100, prob * 100)}%`;
  els.progressCaption.textContent = `当前生成 ${formatNumber(state.attempts)} 个，理论平均 ${Number.isFinite(averageCount) ? formatNumber(averageCount) : '-'} 个出 1 个结果`;
  els.p50.textContent = formatDuration(estimates.p50Ms);
  els.p90.textContent = formatDuration(estimates.p90Ms);
  els.p99.textContent = formatDuration(estimates.p99Ms);
  els.autosaveState.textContent = els.autoSave.checked ? '开启' : '关闭';
  els.suspiciousCount.textContent = String(state.suspiciousCount || 0);
  if (state.lastCheckpointAt) els.checkpointTime.textContent = new Date(state.lastCheckpointAt).toLocaleTimeString();
}

function buildSuspiciousConfig() {
  return {
    enabled: els.suspiciousEnabled.checked,
    leopardEnabled: els.suspiciousLeopard.checked,
    sequenceEnabled: els.suspiciousSequence.checked,
    leopardMinLength: Number(els.leopardMinLength.value) || 4,
    sequenceMinLength: Number(els.sequenceMinLength.value) || 5,
    customSuffixes: els.customSuspiciousSuffixes.value
      .split(/[\s,，;；]+/)
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

function restoreSuspiciousConfig(config = {}) {
  els.suspiciousEnabled.checked = config.enabled !== false;
  els.suspiciousLeopard.checked = config.leopardEnabled !== false;
  els.suspiciousSequence.checked = config.sequenceEnabled !== false;
  els.leopardMinLength.value = config.leopardMinLength || 4;
  els.sequenceMinLength.value = config.sequenceMinLength || 5;
  els.customSuspiciousSuffixes.value = Array.isArray(config.customSuffixes)
    ? config.customSuffixes.join('\n')
    : '';
}

function renderGpu(gpu) {
  els.gpuName.textContent = gpu.name;
  els.gpuUtil.textContent = `${gpu.utilization}%`;
  els.gpuMem.textContent = `${gpu.memoryUsedMb} / ${gpu.memoryTotalMb} MB`;
  els.gpuTemp.textContent = `${gpu.temperatureC}°C`;
  els.gpuPower.textContent = `${gpu.powerW} W`;
  els.gpuSpeed.textContent = '监控模式';
}

function bindMainTabs() {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach((item) => item.classList.remove('active'));
      document.querySelectorAll('.tab-page').forEach((page) => page.classList.remove('active'));
      button.classList.add('active');
      document.getElementById(button.dataset.tab).classList.add('active');
    });
  });
}

function applyCpuBoostMode() {
  if (!els.cpuBoost.checked) {
    els.workerBatchSize.value = '512';
    updateCpuThreadHint();
    return;
  }
  const mode = els.cpuBoostMode.value;
  const threads = mode === 'max' ? systemInfo.maxRecommendedThreads : systemInfo.recommendedThreads;
  els.cpuThreads.value = String(threads);
  els.workerBatchSize.value = mode === 'max' ? '20000' : mode === 'fast' ? '4096' : '512';
  updateCpuThreadHint();
}

function cpuRuntimeConfig() {
  return {
    cpuThreads: Math.max(1, Math.min(Number(els.cpuThreads.value) || 1, 64)),
    batchSize: Math.max(256, Math.min(Number(els.workerBatchSize.value) || 512, 20000)),
  };
}

function updateCpuThreadHint() {
  const current = Math.max(1, Math.min(Number(els.cpuThreads.value) || 1, 64));
  const max = systemInfo.maxRecommendedThreads || systemInfo.logicalCores || current;
  const recommended = systemInfo.recommendedThreads || Math.max(1, max - 1);
  const relation = current > max
    ? '已超过当前检测到的逻辑线程，可能会降低速度'
    : current >= recommended
      ? '适合高速生成'
      : '更省资源，速度会低一些';
  els.cpuThreadHint.textContent = `检测到 ${max} 个 CPU 逻辑线程，建议 ${recommended}-${max} 线程；当前 ${current} 线程，${relation}。`;
}

async function applyRuntimeConfigLive() {
  updateCpuThreadHint();
  if (!latestState || latestState.status === 'completed' || latestState.status === 'restored') return;
  const runtime = cpuRuntimeConfig();
  const applied = await window.vanityApi.setRuntimeConfig(runtime);
  if (!applied) return;
  els.cpuThreads.value = String(applied.cpuThreads);
  els.workerBatchSize.value = String(applied.batchSize);
  updateCpuThreadHint();
}

function updateMatchExample() {
  const mode = els.matchMode.value;
  const p = els.prefixTarget.value.trim() || '8888';
  const c = els.containsTarget.value.trim() || '666';
  const s = els.suffixTarget.value.trim() || '8888';
  const head = chain === 'ETH' ? '0x' : 'T';
  const body = {
    prefix: `${head}${p}***abc`,
    suffix: `${head}abc***${s}`,
    contains: `${head}abc***${c}***xyz`,
    prefix_suffix: `${head}${p}***abc***${s}`,
    prefix_contains: `${head}${p}***${c}***xyz`,
    contains_suffix: `${head}abc***${c}***${s}`,
    prefix_contains_suffix: `${head}${p}***abc***${c}***${s}`,
    smart: `${head}abc***8888`,
  }[mode] || `${head}abc***${s}`;
  els.matchExample.textContent = `示例：${body}`;
}

function bindFilterEvents() {
  document.querySelectorAll('[data-filter-source]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-source]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      filterSource = button.dataset.filterSource;
      els.importControls.classList.toggle('hidden', filterSource !== 'import');
      if (filterSource === 'sync') {
        els.importFileName.textContent = '未导入文件';
        filterItems = [];
        filterActiveCategory = 'ALL';
      }
      applyFilter();
    });
  });

  els.importTxtBtn.addEventListener('click', async () => {
    const file = await window.vanityApi.chooseTxtFile();
    if (!file) return;
    filterSource = 'import';
    filterItems = parseFilterText(file.content, file.path);
    filterActiveCategory = 'ALL';
    els.importFileName.textContent = file.path;
    applyFilter();
  });

  [
    'filterChain',
    'filterLeopard',
    'filterSequence',
    'filterSuffixOnly',
    'filterMnemonicOnly',
    'filterLeopardLength',
    'filterSequenceLength',
    'filterCustomSuffixes',
    'filterKeyword',
  ].forEach((id) => els[id].addEventListener('input', applyFilter));

  els.filterApplyBtn.addEventListener('click', applyFilter);
  els.filterResetBtn.addEventListener('click', resetFilter);
  els.filterClearBtn.addEventListener('click', () => {
    filterItems = [];
    filterActiveCategory = 'ALL';
    applyFilter();
  });
  els.filterExportBtn.addEventListener('click', exportFilterResults);
}

function bindTurboEvents() {
  els.chooseTurboResults.addEventListener('click', () => chooseFolder(els.turboResultsDir));
  els.turboStartBtn.addEventListener('click', startTurbo);
  els.turboPauseBtn.addEventListener('click', async () => {
    els.turboStatus.textContent = '暂停中';
    latestTurboState = await window.vanityApi.turboPause();
    renderTurboState(latestTurboState);
  });
  els.turboResumeBtn.addEventListener('click', async () => {
    els.turboStatus.textContent = '运行中';
    latestTurboState = await window.vanityApi.turboResume();
    renderTurboState(latestTurboState);
  });
  els.turboStopBtn.addEventListener('click', async () => {
    els.turboStatus.textContent = '停止中';
    latestTurboState = await window.vanityApi.turboStop();
    renderTurboState(latestTurboState);
  });
}

async function startTurbo() {
  let targets = parseTurboTargets();
  if (!targets.length) {
    alert('请至少填写一个极速目标后缀。');
    return;
  }
  const chainName = els.turboChain.value;
  if (chainName === 'ETH') {
    targets = targets.map((target) => target.replace(/^0x/i, ''));
  }
  const mode = els.turboMatchMode.value;
  const invalid = targets.find((target) => !isValidTargetForChain(chainName, target));
  if (invalid) {
    alert(`${chainName} 目标内容不合法：${invalid}`);
    return;
  }
  if (els.turboEngine.value === 'cuda') {
    alert('CUDA GPU 极速核心已预留接口，当前版本请使用 CPU 极速。');
    return;
  }
  turboPrivateKeys = new Map();
  renderTurboResults([]);
  els.turboStatus.textContent = '启动中';
  const rule = mode === 'suffix'
    ? { mode: 'suffix', suffixes: targets }
    : { mode, target: targets[0], [mode]: targets[0] };
  latestTurboState = await window.vanityApi.turboStart({
    chain: chainName,
    engine: els.turboEngine.value,
    rule,
    targetCount: els.turboTargetCount.value.trim(),
    cpuThreads: Number(els.turboThreads.value) || 1,
    batchSize: Number(els.turboBatchSize.value) || 4096,
    speedMode: els.turboSpeedMode.value,
    resultsDir: els.turboResultsDir.value,
  });
  renderTurboState(latestTurboState);
}

function parseTurboTargets() {
  return els.turboTargets.value
    .split(/[\s,，;；]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function isValidTargetForChain(chainName, target) {
  if (chainName === 'ETH') return /^[0-9a-fA-F]+$/.test(target.replace(/^0x/i, ''));
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(target);
}

function renderTurboState(state) {
  if (!state) {
    els.turboStatus.textContent = '已停止';
    els.turboSpeed.textContent = '0 地址/秒';
    return;
  }
  const statusText = {
    running: '运行中',
    paused: '已暂停',
    stopped: '已停止',
    completed: '已完成',
  };
  const elapsed = state.elapsedMs || 0;
  const speed = state.speed?.total || state.speed?.cpu || 0;
  const avgSpeed = elapsed > 0 ? Math.round((state.attempts * 1000) / elapsed) : 0;
  els.turboStatus.textContent = statusText[state.status] || '运行中';
  els.turboEngineState.textContent = state.engine === 'cuda' ? 'CUDA GPU 极速' : 'CPU 极速';
  els.turboSpeed.textContent = `${formatNumber(speed)} 地址/秒`;
  els.turboAvgSpeed.textContent = `${formatNumber(avgSpeed)} 地址/秒`;
  els.turboAttempts.textContent = formatNumber(state.attempts || 0);
  els.turboRuntime.textContent = formatDuration(elapsed);
  els.turboHitCount.textContent = formatNumber(state.results?.length || 0);
}

function renderTurboResults(results) {
  turboPrivateKeys = new Map();
  els.turboResultsBody.innerHTML = '';
  if (!results?.length) {
    els.turboResultsBody.innerHTML = '<tr class="empty"><td colspan="8">极速模式等待目标命中结果</td></tr>';
    return;
  }
  results.forEach(addTurboResultRow);
}

function addTurboResultRow(result) {
  const empty = els.turboResultsBody.querySelector('.empty');
  if (empty) empty.remove();
  if (result.privateKey) turboPrivateKeys.set(result.id, result.privateKey);
  const row = document.createElement('tr');
  row.innerHTML = `
    <td>${escapeHtml(result.chain)}</td>
    <td class="address" title="${escapeHtml(result.address)}">${escapeHtml(result.address)}</td>
    <td>${escapeHtml(result.rule || '极速目标')}</td>
    <td>${formatDuration(result.elapsedMs || 0)}</td>
    <td>${formatNumber(result.attempts || 0)}</td>
    <td>${escapeHtml(result.saveStatus || 'saved')}</td>
    <td><button data-turbo-copy="${escapeHtml(result.address)}">复制地址</button></td>
    <td><button data-turbo-key="${escapeHtml(result.id)}">复制私钥</button></td>
  `;
  els.turboResultsBody.prepend(row);
  row.querySelector('[data-turbo-copy]').addEventListener('click', copyTurboValue);
  row.querySelector('[data-turbo-key]').addEventListener('click', async (event) => {
    const privateKey = turboPrivateKeys.get(event.target.dataset.turboKey);
    if (!privateKey) {
      alert('此结果来自恢复状态，当前内存没有私钥。请查看已保存 TXT。');
      return;
    }
    await window.vanityApi.copyText(privateKey);
    event.target.textContent = '已复制';
    setTimeout(() => {
      event.target.textContent = '复制私钥';
    }, 900);
  });
}

async function copyTurboValue(event) {
  await window.vanityApi.copyText(event.target.dataset.turboCopy);
  event.target.textContent = '已复制';
  setTimeout(() => {
    event.target.textContent = '复制地址';
  }, 900);
}

function addFilterItem(item, source) {
  filterItems.unshift(normalizeFilterItem({
    ...item,
    source,
  }));
}

function parseFilterText(text, source) {
  return text.split(/\r?\n/)
    .map((line, index) => parseFilterLine(line, index + 1, source))
    .filter(Boolean);
}

function parseFilterLine(line, lineNo, source) {
  const raw = line.trim();
  if (!raw) return null;
  const parts = raw.split(/\s+/);
  const addressIndex = parts.findIndex((part) => detectFilterChain(part) !== 'UNKNOWN');
  if (addressIndex < 0) return null;
  const address = parts[addressIndex];
  const privateKey = parts.find((part, index) => index !== addressIndex && /^(?:0x)?[0-9a-fA-F]{64}$/.test(part)) || '';
  const mnemonic = parts.filter((part, index) => index !== addressIndex && part !== privateKey).join(' ');
  return normalizeFilterItem({
    lineNo,
    source,
    chain: detectFilterChain(address),
    address,
    privateKey,
    mnemonic,
  });
}

function normalizeFilterItem(item) {
  const chainName = item.chain || detectFilterChain(item.address);
  const body = comparableForFilter(chainName, item.address);
  const leopardRuns = findFilterLeopards(body);
  const sequences = findFilterSequences(body);
  const customSuffixes = getFilterCustomSuffixes().filter((suffix) => body.endsWith(suffix));
  const categories = [
    ...leopardRuns.map((run) => `豹子${run.length}`),
    ...sequences.map((seq) => `${seq.direction}${seq.length}`),
    ...customSuffixes.map((suffix) => `自定义:${suffix}`),
  ];
  return {
    ...item,
    chain: chainName,
    body,
    leopardRuns,
    sequences,
    customSuffixes,
    categories: Array.from(new Set(categories)),
  };
}

function detectFilterChain(address) {
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return 'TRX';
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return 'ETH';
  return 'UNKNOWN';
}

function comparableForFilter(chainName, address) {
  return chainName === 'ETH' ? String(address).toLowerCase().replace(/^0x/, '') : String(address).slice(1);
}

function findFilterLeopards(value) {
  const runs = [];
  let start = 0;
  for (let i = 1; i <= value.length; i += 1) {
    if (i === value.length || value[i].toLowerCase() !== value[start].toLowerCase()) {
      const length = i - start;
      if (length >= 3) runs.push({ start, end: i, length, value: value.slice(start, i) });
      start = i;
    }
  }
  return runs;
}

function findFilterSequences(value) {
  const lower = value.toLowerCase();
  const found = [];
  for (let length = 3; length <= Math.min(8, lower.length); length += 1) {
    for (let start = 0; start <= lower.length - length; start += 1) {
      const piece = lower.slice(start, start + length);
      if ('0123456789'.includes(piece) || piece === 'abcde') {
        found.push({ start, end: start + length, length, direction: '顺子', value: value.slice(start, start + length) });
      }
      if ('9876543210'.includes(piece) || piece === 'edcba') {
        found.push({ start, end: start + length, length, direction: '倒顺', value: value.slice(start, start + length) });
      }
    }
  }
  return found;
}

function getFilterCustomSuffixes() {
  return els.filterCustomSuffixes.value
    .split(/[\s,，;；]+/)
    .map((value) => value.trim().toLowerCase().replace(/^0x/, ''))
    .filter(Boolean);
}

function applyFilter() {
  filterItems = filterItems.map(normalizeFilterItem);
  const chainFilter = els.filterChain.value;
  const leopardMin = Number(els.filterLeopardLength.value);
  const sequenceMin = Number(els.filterSequenceLength.value);
  const keyword = els.filterKeyword.value.trim().toLowerCase();
  const customSuffixes = getFilterCustomSuffixes();

  filterVisible = filterItems.filter((item) => {
    if (chainFilter !== 'ALL' && item.chain !== chainFilter) return false;
    if (filterActiveCategory !== 'ALL' && !item.categories.includes(filterActiveCategory)) return false;
    if (els.filterMnemonicOnly.checked && !item.mnemonic) return false;
    if (keyword && !`${item.address} ${item.privateKey} ${item.mnemonic}`.toLowerCase().includes(keyword)) return false;
    const suffixOnly = els.filterSuffixOnly.checked;
    const leopardHit = els.filterLeopard.checked && item.leopardRuns.some((run) => run.length >= leopardMin && (!suffixOnly || run.end === item.body.length));
    const sequenceHit = els.filterSequence.checked && item.sequences.some((seq) => seq.length >= sequenceMin && (!suffixOnly || seq.end === item.body.length));
    const customHit = customSuffixes.length > 0 && customSuffixes.some((suffix) => item.body.endsWith(suffix));
    return leopardHit || sequenceHit || customHit || (!els.filterLeopard.checked && !els.filterSequence.checked && customSuffixes.length === 0);
  });

  renderFilterStats();
  renderFilterTabs();
  renderFilterRows();
}

function resetFilter() {
  els.filterChain.value = 'ALL';
  els.filterLeopard.checked = true;
  els.filterSequence.checked = true;
  els.filterSuffixOnly.checked = true;
  els.filterMnemonicOnly.checked = false;
  els.filterLeopardLength.value = '4';
  els.filterSequenceLength.value = '5';
  els.filterCustomSuffixes.value = '';
  els.filterKeyword.value = '';
  filterActiveCategory = 'ALL';
  applyFilter();
}

function renderFilterStats() {
  els.filterTotal.textContent = formatNumber(filterItems.length);
  els.filterTrx.textContent = formatNumber(filterItems.filter((item) => item.chain === 'TRX').length);
  els.filterEth.textContent = formatNumber(filterItems.filter((item) => item.chain === 'ETH').length);
  els.filterCount.textContent = formatNumber(filterVisible.length);
}

function renderFilterTabs() {
  const counts = new Map([['ALL', filterItems.length]]);
  for (const item of filterItems) {
    for (const category of item.categories) counts.set(category, (counts.get(category) || 0) + 1);
  }
  const tabs = Array.from(counts.entries()).sort((a, b) => a[0] === 'ALL' ? -1 : b[1] - a[1]);
  els.filterTabs.innerHTML = tabs.map(([name, count]) => (
    `<button class="${filterActiveCategory === name ? 'active' : ''}" data-filter-category="${escapeHtml(name)}">${escapeHtml(name)} (${formatNumber(count)})</button>`
  )).join('');
  els.filterTabs.querySelectorAll('[data-filter-category]').forEach((button) => {
    button.addEventListener('click', () => {
      filterActiveCategory = button.dataset.filterCategory;
      applyFilter();
    });
  });
}

function renderFilterRows() {
  if (!filterVisible.length) {
    els.filterBody.innerHTML = '<tr class="empty"><td colspan="6">没有符合条件的靓号</td></tr>';
    return;
  }
  els.filterBody.innerHTML = filterVisible.map((item) => `
    <tr>
      <td>${escapeHtml(item.chain)}</td>
      <td class="filter-address mono" title="${escapeHtml(item.address)}">${highlightFilterAddress(item)}</td>
      <td>${item.categories.map((category) => `<span class="tag">${escapeHtml(category)}</span>`).join('') || '-'}</td>
      <td>${renderFilterCopyCell(item.privateKey, '私钥')}</td>
      <td>${renderFilterCopyCell(item.mnemonic, '助记词')}</td>
      <td><button data-filter-copy="${escapeHtml(item.address)}">复制地址</button></td>
    </tr>
  `).join('');
  els.filterBody.querySelectorAll('[data-filter-copy]').forEach((button) => {
    button.addEventListener('click', copyFilterValue);
  });
}

function renderFilterCopyCell(value, label) {
  if (!value) return '<span class="muted">-</span>';
  return `
    <div class="filter-copy-cell">
      <span class="filter-value-preview" title="${escapeHtml(value)}">${escapeHtml(compactValue(value))}</span>
      <button data-filter-copy="${escapeHtml(value)}">复制${label}</button>
    </div>
  `;
}

function compactValue(value) {
  const text = String(value);
  if (text.length <= 18) return text;
  return `${text.slice(0, 8)}...${text.slice(-6)}`;
}

async function copyFilterValue(event) {
  const button = event.currentTarget;
  await window.vanityApi.copyText(button.dataset.filterCopy);
  const original = button.textContent;
  button.textContent = '已复制';
  setTimeout(() => {
    button.textContent = original;
  }, 900);
}

function highlightFilterAddress(item) {
  const prefix = item.chain === 'ETH' ? '0x' : 'T';
  const ranges = mergeRanges([
    ...item.leopardRuns,
    ...item.sequences,
    ...item.customSuffixes.map((suffix) => ({ start: item.body.length - suffix.length, end: item.body.length })),
  ]);
  let html = escapeHtml(prefix);
  let cursor = 0;
  for (const range of ranges) {
    html += escapeHtml(item.body.slice(cursor, range.start));
    html += `<mark>${escapeHtml(item.body.slice(range.start, range.end))}</mark>`;
    cursor = range.end;
  }
  html += escapeHtml(item.body.slice(cursor));
  return html;
}

function mergeRanges(ranges) {
  return ranges
    .filter((range) => range.start >= 0 && range.end > range.start)
    .sort((a, b) => a.start - b.start)
    .reduce((merged, range) => {
      const last = merged[merged.length - 1];
      if (!last || range.start > last.end) merged.push({ start: range.start, end: range.end });
      else last.end = Math.max(last.end, range.end);
      return merged;
    }, []);
}

function exportFilterResults() {
  const name = sanitizeFileName(`${filterName()}_${filterVisible.length}.txt`);
  const lines = filterVisible.map((item) => [item.address, item.privateKey, item.mnemonic].filter(Boolean).join(' '));
  const blob = new Blob([`${lines.join('\n')}${lines.length ? '\n' : ''}`], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function filterName() {
  const parts = [];
  if (els.filterChain.value !== 'ALL') parts.push(els.filterChain.value);
  if (filterActiveCategory !== 'ALL') parts.push(filterActiveCategory);
  if (els.filterLeopard.checked) parts.push(`豹子${els.filterLeopardLength.value}+`);
  if (els.filterSequence.checked) parts.push(`顺子${els.filterSequenceLength.value}+`);
  if (els.filterSuffixOnly.checked) parts.push('仅后缀');
  return parts.join('_') || '全部';
}

function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

function renderResults(results) {
  els.resultsBody.innerHTML = '';
  if (!results?.length) {
    els.resultsBody.innerHTML = '<tr class="empty"><td colspan="8">等待目标命中结果</td></tr>';
    return;
  }
  results.forEach(addResultRow);
}

function addResultRow(result) {
  const empty = els.resultsBody.querySelector('.empty');
  if (empty) empty.remove();
  const row = document.createElement('tr');
  row.innerHTML = `
    <td>${escapeHtml(result.chain)}</td>
    <td class="address" title="${escapeHtml(result.address)}">${escapeHtml(result.address)}</td>
    <td>${escapeHtml(result.rule)}</td>
    <td>${formatDuration(result.elapsedMs)}</td>
    <td>${formatNumber(result.attempts)}</td>
    <td>${escapeHtml(result.saveStatus)}</td>
    <td><button data-copy="${escapeHtml(result.address)}">复制</button></td>
    <td class="key-actions">
      <button data-key-view="${escapeHtml(result.id)}" data-encrypted="${result.keyEncrypted ? '1' : '0'}">查看</button>
      <button data-key-copy="${escapeHtml(result.id)}" data-encrypted="${result.keyEncrypted ? '1' : '0'}">复制私钥</button>
    </td>
  `;
  els.resultsBody.prepend(row);
  row.querySelector('[data-copy]').addEventListener('click', async (event) => {
    await window.vanityApi.copyText(event.target.dataset.copy);
    event.target.textContent = '已复制';
    setTimeout(() => {
      event.target.textContent = '复制';
    }, 900);
  });
  row.querySelector('[data-key-view]').addEventListener('click', async (event) => {
    const privateKey = await readPrivateKeyFromButton(event.target);
    if (privateKey) showPrivateKeyModal(privateKey);
  });
  row.querySelector('[data-key-copy]').addEventListener('click', async (event) => {
    const privateKey = await readPrivateKeyFromButton(event.target);
    if (!privateKey) return;
    await window.vanityApi.copyText(privateKey);
    event.target.textContent = '已复制';
    setTimeout(() => {
      event.target.textContent = '复制私钥';
    }, 900);
  });
}

async function readPrivateKeyFromButton(button) {
  const encrypted = button.dataset.encrypted === '1';
  const password = encrypted ? prompt('此结果已加密保存，请输入主密码。', '') : '';
  if (encrypted && password === null) return null;
  try {
    return await window.vanityApi.getPrivateKey({
      resultId: button.dataset.keyView || button.dataset.keyCopy,
      password,
    });
  } catch (error) {
    alert(`无法读取私钥：${error.message}`);
    return null;
  }
}

function showPrivateKeyModal(privateKey) {
  els.privateKeyView.value = privateKey;
  els.privateKeyModal.classList.remove('hidden');
  els.privateKeyView.focus();
  els.privateKeyView.select();
}

function hidePrivateKeyModal() {
  els.privateKeyView.value = '';
  els.privateKeyModal.classList.add('hidden');
}

async function copyPrivateKeyFromModal() {
  await window.vanityApi.copyText(els.privateKeyView.value);
  els.copyPrivateKeyBtn.textContent = '已复制私钥';
  setTimeout(() => {
    els.copyPrivateKeyBtn.textContent = '复制私钥';
  }, 900);
}

function refreshDifficulty() {
  difficulty = computeDifficulty(chain, {
    ...buildRuleFromInputs(),
  });
  els.difficulty.textContent = Number.isFinite(difficulty.difficulty)
    ? formatNumber(Math.round(difficulty.difficulty))
    : '-';
  if (latestState) renderState(latestState);
}

function computeDifficulty(activeChain, rule) {
  const alphabetSize = activeChain === 'TRX' ? 58 : 16;
  if (rule.mode === 'smart') return { probability: 1 / 10000, difficulty: 10000 };
  const prefix = rule.mode === 'prefix' ? rule.target : rule.prefix;
  const contains = rule.mode === 'contains' ? rule.target : rule.contains;
  const suffix = rule.mode === 'suffix' ? rule.target : rule.suffix;
  if (!prefix && !contains && !suffix) return { probability: 0, difficulty: Infinity };
  let probability = 1;
  if (prefix) probability *= 1 / alphabetSize ** prefix.length;
  if (suffix) probability *= 1 / alphabetSize ** suffix.length;
  if (contains) {
    const length = activeChain === 'TRX' ? 33 : 40;
    probability *= Math.min(1, Math.max(1, length - contains.length + 1) / alphabetSize ** contains.length);
  }
  return { probability, difficulty: 1 / probability };
}

function buildRuleFromInputs() {
  const mode = els.matchMode.value;
  return {
    mode,
    target: legacyTargetForMode(),
    prefix: needsPrefix(mode) ? els.prefixTarget.value.trim() : '',
    contains: needsContains(mode) ? els.containsTarget.value.trim() : '',
    suffix: needsSuffix(mode) ? els.suffixTarget.value.trim() : '',
  };
}

function validateRuleBeforeStart() {
  const rule = buildRuleFromInputs();
  const values = [rule.target, rule.prefix, rule.contains, rule.suffix].filter(Boolean);
  if (rule.mode !== 'smart' && values.length === 0) {
    return { valid: false, message: '请先填写目标规则，例如前缀、包含或后缀。没有目标规则不会产生目标命中结果。' };
  }

  const joined = values.join('');
  if (chain === 'ETH' && joined && !/^[0-9a-fA-F]+$/.test(joined)) {
    return { valid: false, message: 'ETH 规则只能填写十六进制字符：0-9、a-f。' };
  }
  if (chain === 'TRX' && joined && !/^[1-9A-HJ-NP-Za-km-z]+$/.test(joined)) {
    return { valid: false, message: 'TRX 地址使用 Base58 字符，不能包含 0、O、I、l 等字符。' };
  }
  return { valid: true, message: '' };
}

function legacyTargetForMode() {
  const mode = els.matchMode.value;
  if (mode === 'prefix') return els.prefixTarget.value.trim();
  if (mode === 'contains') return els.containsTarget.value.trim();
  if (mode === 'suffix') return els.suffixTarget.value.trim();
  return '';
}

function updateTargetInputs() {
  const mode = els.matchMode.value;
  setTargetEnabled('prefixTarget', needsPrefix(mode));
  setTargetEnabled('containsTarget', needsContains(mode));
  setTargetEnabled('suffixTarget', needsSuffix(mode));
}

function setTargetEnabled(id, enabled) {
  els[id].disabled = !enabled;
  els[id].parentElement.classList.toggle('disabled-field', !enabled);
}

function updateSaveOptions() {
  const mnemonicEnabled = generationSource === 'mnemonic';
  els.saveMnemonic.disabled = !mnemonicEnabled;
  els.saveMnemonic.parentElement.classList.toggle('disabled-field', !mnemonicEnabled);
  if (!mnemonicEnabled) {
    els.saveMnemonic.checked = false;
  }
}

function needsPrefix(mode) {
  return ['prefix', 'prefix_suffix', 'prefix_contains', 'prefix_contains_suffix'].includes(mode);
}

function needsContains(mode) {
  return ['contains', 'prefix_contains', 'contains_suffix', 'prefix_contains_suffix'].includes(mode);
}

function needsSuffix(mode) {
  return ['suffix', 'prefix_suffix', 'contains_suffix', 'prefix_contains_suffix'].includes(mode);
}

function cumulativeHitProbability(p, n) {
  if (!Number.isFinite(p) || p <= 0) return 0;
  return 1 - (1 - p) ** n;
}

function estimateHitTimes(diff, speed) {
  if (!Number.isFinite(diff) || speed <= 0) return { p50Ms: Infinity, p90Ms: Infinity, p99Ms: Infinity };
  const p = 1 / diff;
  return {
    p50Ms: (Math.log(1 - 0.5) / Math.log(1 - p) / speed) * 1000,
    p90Ms: (Math.log(1 - 0.9) / Math.log(1 - p) / speed) * 1000,
    p99Ms: (Math.log(1 - 0.99) / Math.log(1 - p) / speed) * 1000,
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN').format(Math.round(value || 0));
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '-';
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}
