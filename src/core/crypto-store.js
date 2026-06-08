import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import argon2 from 'argon2';

const VERSION = 1;
const KDF = 'argon2id';
const CIPHER = 'aes-256-gcm';
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;

export async function encryptPrivateKey(privateKey, password) {
  if (!password || password.length < 8) {
    throw new Error('Master password must be at least 8 characters');
  }

  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(password, salt);
  const cipher = createCipheriv(CIPHER, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKey, 'utf8'),
    cipher.final(),
  ]);

  return {
    version: VERSION,
    kdf: KDF,
    cipher: CIPHER,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}

export async function decryptPrivateKey(record, password) {
  try {
    if (record.version !== VERSION || record.kdf !== KDF || record.cipher !== CIPHER) {
      throw new Error('Unsupported encrypted private key format');
    }

    const salt = Buffer.from(record.salt, 'base64');
    const iv = Buffer.from(record.iv, 'base64');
    const key = await deriveKey(password, salt);
    const decipher = createDecipheriv(CIPHER, key, iv);
    decipher.setAuthTag(Buffer.from(record.tag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    throw new Error(`Private key decrypt failed: ${error.message}`);
  }
}

async function deriveKey(password, salt) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    raw: true,
    salt,
    hashLength: KEY_BYTES,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}
