import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerUrl = new URL('../src/worker/generator-worker.js', import.meta.url);
const threadCount = Number(process.argv[2] || 4);
const chain = process.argv[3] || 'TRX';
const seconds = Number(process.argv[4] || 5);

let attempts = 0;
const workers = [];
const config = {
  chain,
  generationSource: 'private_key',
  batchSize: 512,
  rule: { mode: 'suffix', suffix: 'zzzzzzzzzz' },
  suspicious: { enabled: false },
};

for (let i = 0; i < threadCount; i += 1) {
  const worker = new Worker(workerUrl, {
    workerData: { config, workerIndex: i },
  });
  worker.on('message', (message) => {
    if (message.type === 'stats') attempts += message.attempts;
  });
  workers.push(worker);
}

setTimeout(async () => {
  for (const worker of workers) worker.postMessage({ type: 'stop' });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await Promise.all(workers.map((worker) => worker.terminate()));
  console.log(JSON.stringify({
    chain,
    threadCount,
    seconds,
    attempts,
    addrPerSec: Math.round(attempts / seconds),
  }, null, 2));
}, seconds * 1000);
