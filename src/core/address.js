import { randomBytes } from 'node:crypto';
import { getPublicKey } from '@noble/secp256k1';
import bs58check from 'bs58check';
import { HDNodeWallet, Mnemonic, ethers } from 'ethers';
import sha3 from 'js-sha3';

const { keccak_256 } = sha3;

const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;
const SECP256K1_N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');

export function isPrivateKeyHex(value) {
  if (!PRIVATE_KEY_RE.test(value)) {
    return false;
  }
  const n = BigInt(value);
  return n > 0n && n < SECP256K1_N;
}

export function generatePrivateKey() {
  while (true) {
    const privateKey = `0x${randomBytes(32).toString('hex')}`;
    if (isPrivateKeyHex(privateKey)) {
      return privateKey;
    }
  }
}

export function createAddressFromPrivateKey(chain, privateKey) {
  const normalizedChain = chain.toUpperCase();
  const normalizedPrivateKey = normalizePrivateKey(privateKey);

  if (normalizedChain === 'ETH') {
    return {
      chain: 'ETH',
      address: ethers.getAddress(ethers.computeAddress(normalizedPrivateKey)),
      privateKey: normalizedPrivateKey,
    };
  }

  if (normalizedChain === 'TRX') {
    return {
      chain: 'TRX',
      address: tronAddressFromPrivateKey(normalizedPrivateKey),
      privateKey: normalizedPrivateKey,
    };
  }

  throw new Error(`Unsupported chain: ${chain}`);
}

export function createAddressFromMnemonic(chain, phrase) {
  const normalizedChain = chain.toUpperCase();
  const path = normalizedChain === 'TRX'
    ? "m/44'/195'/0'/0/0"
    : "m/44'/60'/0'/0/0";
  const wallet = HDNodeWallet.fromPhrase(phrase, undefined, path);
  const result = createAddressFromPrivateKey(normalizedChain, wallet.privateKey);
  return {
    ...result,
    mnemonic: phrase,
    derivationPath: path,
  };
}

export function generateMnemonicPhrase() {
  return Mnemonic.entropyToPhrase(randomBytes(16));
}

export function createWalletCandidate(chain, source = 'private_key') {
  if (source === 'mnemonic') {
    return createAddressFromMnemonic(chain, generateMnemonicPhrase());
  }
  return createAddressFromPrivateKey(chain, generatePrivateKey());
}

export function normalizePrivateKey(privateKey) {
  const value = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  if (!isPrivateKeyHex(value)) {
    throw new Error('Invalid secp256k1 private key');
  }
  return value.toLowerCase();
}

export function formatPrivateKeyForWallet(chain, privateKey) {
  const normalized = normalizePrivateKey(privateKey);
  if (chain.toUpperCase() === 'TRX') {
    return normalized.slice(2);
  }
  if (chain.toUpperCase() === 'ETH') {
    return normalized.slice(2);
  }
  throw new Error(`Unsupported chain: ${chain}`);
}

function tronAddressFromPrivateKey(privateKey) {
  const privateKeyBytes = hexToBytes(privateKey.slice(2));
  const publicKey = getPublicKey(privateKeyBytes, false).slice(1);
  const hash = Buffer.from(keccak_256.arrayBuffer(publicKey));
  const addressBody = hash.subarray(hash.length - 20);
  const prefixed = Buffer.concat([Buffer.from([0x41]), addressBody]);
  return bs58check.encode(prefixed);
}

function hexToBytes(hex) {
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}
