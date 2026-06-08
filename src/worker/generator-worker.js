import { parentPort, workerData } from 'node:worker_threads';
import { createWalletCandidate } from '../core/address.js';
import { isSuspiciousVanity, matchesRule } from '../core/matching.js';

const { config, workerIndex } = workerData;
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
  while (!stopped && running) {
    const wallet = createWalletCandidate(config.chain, config.generationSource);
    totalLocalAttempts += 1;
    attemptsSinceStats += 1;

    const rule = config.rule ?? { mode: config.matchMode, target: config.target };
    if (matchesRule(config.chain, wallet.address, rule)) {
      parentPort.postMessage({
        type: 'target-hit',
        hit: {
          ...wallet,
          rule: describeRule(rule),
          localAttempts: totalLocalAttempts,
        },
      });
    } else if (isSuspiciousVanity(config.chain, wallet.address)) {
      parentPort.postMessage({
        type: 'suspicious-hit',
        hit: {
          ...wallet,
          rule: 'suspicious:auto',
          localAttempts: totalLocalAttempts,
        },
      });
    }

    const now = Date.now();
    if (now - windowStart >= 1000) {
      parentPort.postMessage({
        type: 'stats',
        workerIndex,
        attempts: attemptsSinceStats,
        addrPerSec: Math.round((attemptsSinceStats * 1000) / (now - windowStart)),
      });
      attemptsSinceStats = 0;
      windowStart = now;
      await yieldToEventLoop();
    }
  }
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
