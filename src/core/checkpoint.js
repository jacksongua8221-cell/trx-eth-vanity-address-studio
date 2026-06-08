import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function createCheckpoint({
  config,
  attempts = 0,
  startedAt = new Date().toISOString(),
  elapsedMs = 0,
  results = [],
  suspiciousCount = 0,
  stats = {},
} = {}) {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    config,
    attempts,
    startedAt,
    elapsedMs,
    results,
    suspiciousCount,
    stats,
  };
}

export async function saveCheckpoint(filePath, checkpoint) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  const payload = JSON.stringify(
    { ...checkpoint, savedAt: new Date().toISOString() },
    null,
    2
  );
  await writeFile(tempPath, payload, 'utf8');
  await rename(tempPath, filePath);
}

export async function loadCheckpoint(filePath) {
  const payload = await readFile(filePath, 'utf8');
  const checkpoint = JSON.parse(payload);
  if (checkpoint.version !== 1) {
    throw new Error('Unsupported checkpoint version');
  }
  return checkpoint;
}
