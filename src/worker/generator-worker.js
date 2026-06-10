import { parentPort, workerData } from 'node:worker_threads';
import { createWalletCandidate } from '../core/address.js';
import { isSuspiciousVanity, matchesRule } from '../core/matching.js';

const { config, workerIndex } = workerData;
const STATS_INTERVAL_MS = 250;
let runtimeConfig = { ...config };
let batchSize = clampBatchSize(runtimeConfig.batchSize);
let running = true;
let stopped = false;
let attemptsSinceStats = 0;
let totalLocalAttempts = 0;
let windowStart = Date.now();

parentPort.on('message', (message) => {
  if (message.type === 'pause') running = false;
  if (message.type === 'config') {
    runtimeConfig = { ...runtimeConfig, ...message.config };
    batchSize = clampBatchSize(runtimeConfig.batchSize);
  }
  if (message.type === 'resume') {
    running = true;
    loop();
  }
  if (message.type === 'stop') stopped = true;
});

loop();

async function loop() {
  while (!stopped && running) {
    for (let i = 0; i < batchSize && !stopped && running; i += 1) {
      const wallet = createWalletCandidate(runtimeConfig.chain, runtimeConfig.generationSource);
      totalLocalAttempts += 1;
      attemptsSinceStats += 1;

      const rule = runtimeConfig.rule ?? { mode: runtimeConfig.matchMode, target: runtimeConfig.target };
      if (matchesRule(runtimeConfig.chain, wallet.address, rule)) {
        parentPort.postMessage({
          type: 'target-hit',
          hit: {
            ...wallet,
            rule: describeRule(rule),
            localAttempts: totalLocalAttempts,
          },
        });
      } else if (isSuspiciousVanity(runtimeConfig.chain, wallet.address, runtimeConfig.suspicious)) {
        parentPort.postMessage({
          type: 'suspicious-hit',
          hit: {
            ...wallet,
            rule: '后缀疑似',
            localAttempts: totalLocalAttempts,
          },
        });
      }
      if (i % 256 === 0) {
        await maybeReportStats();
      }
    }

    await maybeReportStats();
  }
}

async function maybeReportStats() {
  const now = Date.now();
  const elapsed = now - windowStart;
  if (!attemptsSinceStats || elapsed < STATS_INTERVAL_MS) return;
  parentPort.postMessage({
    type: 'stats',
    workerIndex,
    attempts: attemptsSinceStats,
    addrPerSec: Math.round((attemptsSinceStats * 1000) / elapsed),
  });
  attemptsSinceStats = 0;
  windowStart = now;
  await yieldToEventLoop();
}

function clampBatchSize(value) {
  return Math.max(256, Math.min(Number(value) || 512, 20000));
}

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

function describeRule(rule) {
  if (rule.mode === 'smart') return '智能识别';
  return [
    rule.prefix ? `前缀:${rule.prefix}` : '',
    rule.contains ? `包含:${rule.contains}` : '',
    rule.suffix ? `后缀:${rule.suffix}` : '',
    rule.target && !rule.prefix && !rule.contains && !rule.suffix ? `${rule.mode}:${rule.target}` : '',
  ].filter(Boolean).join(' + ');
}
