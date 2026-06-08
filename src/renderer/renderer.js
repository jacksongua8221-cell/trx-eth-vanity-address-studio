let chain = 'TRX';
let generationSource = 'private_key';
let latestState = null;
let resumeCheckpoint = null;
let difficulty = { probability: 0, difficulty: Infinity };

const els = Object.fromEntries(
  Array.from(document.querySelectorAll('[id]')).map((el) => [el.id, el])
);

init();

async function init() {
  const folders = await window.vanityApi.defaultFolders();
  els.resultsDir.value = folders.resultsDir;
  els.suspiciousDir.value = folders.suspiciousDir;
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
      refreshDifficulty();
    });
  });
  updateTargetInputs();
  updateSaveOptions();
  els.encryptPrivateKeys.addEventListener('change', () => {
    const encrypted = els.encryptPrivateKeys.checked;
    els.plainWarning.classList.toggle('hidden', encrypted);
    els.masterPassword.disabled = !encrypted;
    els.masterPassword.placeholder = encrypted ? '加密保存和查看私钥使用' : '仅打开加密保存时需要';
  });
  els.masterPassword.disabled = !els.encryptPrivateKeys.checked;
  els.chooseResults.addEventListener('click', () => chooseFolder(els.resultsDir));
  els.chooseSuspicious.addEventListener('click', () => chooseFolder(els.suspiciousDir));
  els.startBtn.addEventListener('click', start);
  els.restoreBtn.addEventListener('click', restoreCheckpoint);
  els.tgLink.addEventListener('click', () => window.vanityApi.openExternal('https://t.me/nbb111222'));
  els.closeKeyModal.addEventListener('click', hidePrivateKeyModal);
  els.copyPrivateKeyBtn.addEventListener('click', copyPrivateKeyFromModal);
  els.pauseBtn.addEventListener('click', () => window.vanityApi.pause());
  els.resumeBtn.addEventListener('click', () => window.vanityApi.resume());
  els.stopBtn.addEventListener('click', async () => {
    await window.vanityApi.stop();
    els.runStatus.textContent = '已停止';
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
  window.vanityApi.onCheckpoint(({ savedAt }) => {
    els.checkpointTime.textContent = new Date(savedAt).toLocaleTimeString();
  });
  window.vanityApi.onGpu(renderGpu);
  window.vanityApi.onError((message) => {
    els.runStatus.textContent = `错误：${message}`;
  });
}

async function chooseFolder(input) {
  const folder = await window.vanityApi.chooseFolder();
  if (folder) input.value = folder;
}

async function start() {
  const ruleValidation = validateRuleBeforeStart();
  if (!ruleValidation.valid) {
    alert(ruleValidation.message);
    return;
  }
  if (els.encryptPrivateKeys.checked && els.masterPassword.value.length < 8) {
    alert('开启加密保存时，请设置至少 8 位主密码。关闭加密保存则不需要密码。');
    return;
  }
  if (!els.savePrivateKey.checked && !(generationSource === 'mnemonic' && els.saveMnemonic.checked)) {
    alert('请至少选择一种 TXT 保存内容：私钥或助记词。');
    return;
  }
  if (!els.encryptPrivateKeys.checked) {
    const ok = confirm('风险提示：当前未开启加密保存，私钥会明文写入本地文件。确定继续吗？');
    if (!ok) return;
  }

  const config = {
    chain,
    matchMode: els.matchMode.value,
    target: legacyTargetForMode(),
    rule: buildRuleFromInputs(),
    generationSource,
    savePrivateKey: els.savePrivateKey.checked,
    saveMnemonic: els.saveMnemonic.checked && generationSource === 'mnemonic',
    targetCount: els.targetCount.value.trim(),
    cpuThreads: Number(els.cpuThreads.value),
    gpuEnabled: els.gpuEnabled.checked,
    autoSave: els.autoSave.checked,
    encryptPrivateKeys: els.encryptPrivateKeys.checked,
    masterPassword: els.masterPassword.value,
    suspiciousDir: els.suspiciousDir.value,
    resultsDir: els.resultsDir.value,
    resume: resumeCheckpoint,
  };
  latestState = await window.vanityApi.start(config);
  resumeCheckpoint = null;
  els.runStatus.textContent = '运行中';
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
  els.runStatus.textContent = '已恢复';
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
    running: '运行中',
  };
  els.runStatus.textContent = statusText[state.status] || '运行中';
  els.cpuSpeed.textContent = `${formatNumber(state.speed?.cpu || 0)} addr/sec`;
  els.gpuSpeed.textContent = `${formatNumber(state.speed?.gpu || 0)} addr/sec`;
  els.totalSpeed.textContent = `${formatNumber(totalSpeed)} addr/sec`;
  els.attempts.textContent = formatNumber(state.attempts);
  els.avgSpeed.textContent = `${formatNumber(avgSpeed)} addr/sec`;
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

function renderGpu(gpu) {
  els.gpuName.textContent = gpu.name;
  els.gpuUtil.textContent = `${gpu.utilization}%`;
  els.gpuMem.textContent = `${gpu.memoryUsedMb} / ${gpu.memoryTotalMb} MB`;
  els.gpuTemp.textContent = `${gpu.temperatureC}°C`;
  els.gpuPower.textContent = `${gpu.powerW} W`;
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
