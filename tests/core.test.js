import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ethers } from 'ethers';
import TronWeb from 'tronweb';

import {
  createAddressFromPrivateKey,
  createAddressFromMnemonic,
  createWalletCandidate,
  formatPrivateKeyForWallet,
  generatePrivateKey,
  isPrivateKeyHex,
} from '../src/core/address.js';
import {
  decryptPrivateKey,
  encryptPrivateKey,
} from '../src/core/crypto-store.js';
import {
  createCheckpoint,
  loadCheckpoint,
  saveCheckpoint,
} from '../src/core/checkpoint.js';
import {
  computeDifficulty,
  cumulativeHitProbability,
  estimateHitTimes,
  matchesRule,
} from '../src/core/matching.js';

test('generates ETH private keys and addresses that ethers verifies', async () => {
  for (let i = 0; i < 10; i += 1) {
    const privateKey = generatePrivateKey();
    const result = createAddressFromPrivateKey('ETH', privateKey);
    const wallet = new ethers.Wallet(privateKey);

    assert.equal(isPrivateKeyHex(privateKey), true);
    assert.equal(result.privateKey, privateKey);
    assert.equal(result.address, wallet.address);
    assert.match(result.address, /^0x[0-9a-fA-F]{40}$/);
  }
});

test('generates TRX private keys and addresses that TronWeb verifies', async () => {
  for (let i = 0; i < 10; i += 1) {
    const privateKey = generatePrivateKey();
    const result = createAddressFromPrivateKey('TRX', privateKey);
    const tronAddress = TronWeb.utils.crypto.pkToAddress(privateKey.slice(2));

    assert.equal(isPrivateKeyHex(privateKey), true);
    assert.equal(result.privateKey, privateKey);
    assert.equal(result.address, tronAddress);
    assert.match(result.address, /^T[1-9A-HJ-NP-Za-km-z]{33}$/);
  }
});

test('formats wallet-import private keys correctly for TRX and ETH', () => {
  const privateKey = generatePrivateKey();
  const trxKey = formatPrivateKeyForWallet('TRX', privateKey);
  const ethKey = formatPrivateKeyForWallet('ETH', privateKey);
  const trxAddress = createAddressFromPrivateKey('TRX', trxKey).address;
  const ethAddress = createAddressFromPrivateKey('ETH', ethKey).address;

  assert.match(trxKey, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(trxKey, /^0x/);
  assert.match(ethKey, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(ethKey, /^0x/);
  assert.equal(TronWeb.utils.crypto.pkToAddress(trxKey), trxAddress);
  assert.equal(new ethers.Wallet(`0x${ethKey}`).address, ethAddress);
});

test('generates mnemonic wallets for ETH and TRX standard paths', () => {
  const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const eth = createAddressFromMnemonic('ETH', phrase);
  const trx = createAddressFromMnemonic('TRX', phrase);

  assert.equal(eth.derivationPath, "m/44'/60'/0'/0/0");
  assert.equal(trx.derivationPath, "m/44'/195'/0'/0/0");
  assert.match(eth.mnemonic, /abandon/);
  assert.match(trx.address, /^T/);
  assert.equal(createWalletCandidate('ETH', 'mnemonic').mnemonic.split(' ').length, 12);
});

test('encrypts private keys with password and rejects wrong password', async () => {
  const privateKey = generatePrivateKey();
  const encrypted = await encryptPrivateKey(privateKey, 'correct horse battery staple');
  const decrypted = await decryptPrivateKey(encrypted, 'correct horse battery staple');

  assert.equal(decrypted, privateKey);
  await assert.rejects(
    () => decryptPrivateKey(encrypted, 'wrong password'),
    /decrypt/i
  );
});

test('saves and loads checkpoint with attempts, stats, and results intact', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vanity-checkpoint-'));
  const checkpointPath = path.join(dir, 'checkpoint.json');
  const checkpoint = createCheckpoint({
    config: { chain: 'ETH', mode: 'suffix', target: '8888' },
    attempts: 123456,
    startedAt: '2026-06-08T00:00:00.000Z',
    elapsedMs: 9876,
    results: [{ chain: 'ETH', address: '0xabc', privateKeyRef: 'encrypted' }],
    suspiciousCount: 7,
  });

  await saveCheckpoint(checkpointPath, checkpoint);
  const restored = await loadCheckpoint(checkpointPath);

  assert.deepEqual(restored.config, checkpoint.config);
  assert.equal(restored.attempts, 123456);
  assert.equal(restored.results.length, 1);
  assert.equal(restored.suspiciousCount, 7);
  await rm(dir, { recursive: true, force: true });
});

test('matching and probability calculations follow requested estimates', () => {
  assert.equal(matchesRule('ETH', '0x0000deadbeef', { mode: 'suffix', target: 'beef' }), true);
  assert.equal(matchesRule('TRX', 'TABC8888XYZ', { mode: 'contains', target: '8888' }), true);
  assert.equal(matchesRule('ETH', '0xabcd00000000000000000000000000000000beef', {
    mode: 'prefix_suffix',
    prefix: 'abcd',
    suffix: 'beef',
  }), true);
  assert.equal(matchesRule('ETH', '0xabcd00000000cafe00000000000000000000beef', {
    mode: 'prefix_contains_suffix',
    prefix: 'abcd',
    contains: 'cafe',
    suffix: 'beef',
  }), true);
  assert.equal(computeDifficulty('ETH', { mode: 'prefix', target: 'abcd' }).difficulty, 16 ** 4);
  assert.equal(Math.round(computeDifficulty('TRX', { mode: 'suffix', target: '888' }).difficulty), 58 ** 3);
  assert.equal(computeDifficulty('ETH', { mode: 'prefix_suffix', prefix: 'ab', suffix: 'cd' }).difficulty, 16 ** 4);

  const p = 1 / 1000;
  const prob = cumulativeHitProbability(p, 1000);
  assert.ok(prob > 0.63 && prob < 0.64);

  const times = estimateHitTimes(1000, 100);
  assert.ok(times.p50Ms > 6000 && times.p50Ms < 8000);
  assert.ok(times.p90Ms > times.p50Ms);
  assert.ok(times.p99Ms > times.p90Ms);
});
