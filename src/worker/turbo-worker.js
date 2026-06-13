import { parentPort, workerData } from 'node:worker_threads';
import { createWalletCandidate } from '../core/address.js';
import { matchesRule } from '../core/matching.js';

const { config, workerIndex } = workerData;
const STATS_INTERVAL_MS = 250;

let running = true;
let stopped = false;
let attemptsSinceStats = 0;
let totalLocalAttempts = 0;
let windowStart = Date.now();

parentPort.on('message', (message) => {
  if (message.type === 'pause') running = false;
  if (message.type === 'resume') {
    running = true;
    loop();
  }
  if (message.type === 'stop') stopped = true;
});

loop();

async function loop() {
  const batchSize = clampBatchSize(config.batchSize);
  const throttleMs = speedModeDelay(config.speedMode);
  const rule = config.rule ?? { mode: config.matchMode, target: config.target };

  while (!stopped && running) {
    for (let i = 0; i < batchSize && !stopped && running; i += 1) {
      const wallet = createWalletCandidate(config.chain, 'private_key');
      totalLocalAttempts += 1;
      attemptsSinceStats += 1;

      const matchedRule = matchesTurboRule(config.chain, wallet.address, rule);
      if (matchedRule) {
        parentPort.postMessage({
          type: 'target-hit',
          hit: {
            ...wallet,
            rule: describeRule(matchedRule),
            localAttempts: totalLocalAttempts,
          },
        });
      }

      if (i % 256 === 0) {
        await maybeReportStats();
      }
    }

    await maybeReportStats();
    if (throttleMs > 0) await sleep(throttleMs);
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
  return Math.max(256, Math.min(Number(value) || 4096, 50000));
}

function speedModeDelay(mode) {
  if (mode === 'eco') return 20;
  if (mode === 'balanced') return 5;
  return 0;
}

function describeRule(rule) {
  return [
    rule.prefix ? `前缀:${rule.prefix}` : '',
    rule.contains ? `包含:${rule.contains}` : '',
    rule.suffix ? `后缀:${rule.suffix}` : '',
    rule.target && !rule.prefix && !rule.contains && !rule.suffix ? `${rule.mode}:${rule.target}` : '',
  ].filter(Boolean).join(' + ') || '极速目标';
}

function matchesTurboRule(chain, address, rule) {
  if (Array.isArray(rule.suffixes) && rule.suffixes.length) {
    const matchedSuffix = rule.suffixes.find((suffix) => matchesRule(chain, address, { mode: 'suffix', suffix }));
    return matchedSuffix ? { mode: 'suffix', suffix: matchedSuffix } : null;
  }
  return matchesRule(chain, address, rule) ? rule : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}
