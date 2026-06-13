const els = Object.fromEntries([...document.querySelectorAll('[id]')].map((el) => [el.id, el]));

init();

async function init() {
  const info = await window.vanityClean.systemInfo();
  els.gpu.textContent = info.gpu;
  els.cpu.textContent = info.cpu;
  els.resultsDir.value = info.resultsDir;
  bind();
  updateExample();
}

function bind() {
  els.chain.addEventListener('change', updateExample);
  els.mode.addEventListener('change', updateExample);
  els.chooseDir.addEventListener('click', async () => {
    const folder = await window.vanityClean.chooseFolder();
    if (folder) els.resultsDir.value = folder;
  });
  els.openDir.addEventListener('click', () => window.vanityClean.openFolder(els.resultsDir.value));
  els.startBtn.addEventListener('click', start);
  els.stopBtn.addEventListener('click', stop);
  window.vanityClean.onUpdate(render);
  window.vanityClean.onHit(addRow);
  window.vanityClean.onError((message) => alert(message));
}

async function start() {
  if (!els.targets.value.trim()) {
    alert('请填写目标内容');
    return;
  }
  els.status.textContent = '启动中';
  els.rows.innerHTML = '<tr class="empty"><td colspan="6">等待命中结果</td></tr>';
  render(await window.vanityClean.start({
    chain: els.chain.value,
    mode: els.mode.value,
    targets: els.targets.value,
    suspiciousLeopard: els.suspiciousLeopard.checked,
    leopardMin: Number(els.leopardMin.value),
    leopardDigits: els.leopardDigits.checked,
    leopardLetters: els.leopardLetters.checked,
    suspiciousSequence: els.suspiciousSequence.checked,
    resultsDir: els.resultsDir.value,
  }));
}

async function stop() {
  els.status.textContent = '停止中';
  render(await window.vanityClean.stop());
}

function render(state) {
  els.status.textContent = ({ starting: '启动中', running: '运行中', stopped: '已停止' })[state.status] || '待机';
  els.detail.textContent = state.detail || '';
  els.speed.textContent = `${fmt(state.speed)} 地址/秒`;
  els.attempts.textContent = fmt(state.attempts);
  els.runtime.textContent = duration(state.elapsedMs);
  els.targetHits.textContent = fmt(state.targetHits);
  els.suspiciousHits.textContent = fmt(state.suspiciousHits);
}

function addRow(hit) {
  const empty = els.rows.querySelector('.empty');
  if (empty) empty.remove();
  const row = document.createElement('tr');
  row.innerHTML = `
    <td>${hit.kind === 'target' ? '目标' : '疑似'}</td>
    <td>${hit.chain}</td>
    <td class="addr" title="${escapeHtml(hit.address)}">${escapeHtml(hit.address)}</td>
    <td>${escapeHtml(hit.rule)}</td>
    <td class="key" title="${escapeHtml(hit.privateKey)}">${escapeHtml(hit.privateKey)}</td>
    <td><button data-copy="${escapeHtml(hit.address)}">地址</button><button data-copy="${escapeHtml(hit.privateKey)}">私钥</button></td>
  `;
  row.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = '已复制';
    });
  });
  els.rows.prepend(row);
}

function updateExample() {
  const chain = els.chain.value;
  const mode = els.mode.value;
  const examples = {
    suffix: chain === 'ETH' ? '填 8888 -> 0x****8888' : '填 8888 -> T****8888',
    prefix: chain === 'ETH' ? '填 abcd -> 0xabcd****' : '填 ABCD -> TABCD****',
    contains: chain === 'ETH' ? '填 cafe -> 0x****cafe****' : 'TRX 高速核心主要用于前缀/后缀',
    prefix_suffix: chain === 'ETH' ? '填 ab|88 -> 0xab****88' : '填 AB|88 -> TAB****88',
  };
  els.example.textContent = examples[mode];
}

function fmt(value) {
  return new Intl.NumberFormat('zh-CN').format(Math.round(Number(value) || 0));
}

function duration(ms) {
  const total = Math.floor((ms || 0) / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
