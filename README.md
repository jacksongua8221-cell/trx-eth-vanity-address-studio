# TRX / ETH Vanity Address Studio

[中文说明](./README.zh-CN.md)

An offline desktop vanity address generator for **TRON (TRX)** and **Ethereum (ETH)**, built for people who want wallet-importable addresses without sending private keys, mnemonics, addresses, or task records anywhere.

> Local first. No cloud worker. No telemetry. No private key upload.

![Main window](./docs/images/main-window.png)

## Highlights

- **TRX and ETH support**: generate standard secp256k1 private keys and valid chain addresses.
- **Wallet-importable output**: private keys are exported as 64-character hex strings for wallet import.
- **Multiple matching modes**: prefix, suffix, contains, prefix + suffix, prefix + contains, contains + suffix, full combined rule, and smart detection.
- **Optional mnemonic mode**: choose private key generation, mnemonic generation, or save both fields when mnemonic mode is enabled.
- **Probability dashboard**: shows theoretical difficulty, attempts, hit probability, expected 50% / 90% / 99% hit time, and live speed.
- **GPU status panel**: displays NVIDIA status through `nvidia-smi`; AMD / Intel hooks are reserved.
- **Crash-resistant checkpointing**: task state is checkpointed while running; random sequence is not replayed, but stats and saved hits continue.
- **Separate suspicious hits**: target hits stay in the main result list; suspicious vanity-like addresses are saved separately.
- **TXT result files**: saved result files keep only address/key fields by default.

## Address Correctness

The generator follows the standard derivation rules:

**ETH**

```text
private key -> secp256k1 public key -> Keccak-256 -> last 20 bytes -> EIP-55 checksum address
```

**TRX**

```text
private key -> secp256k1 public key -> Keccak-256 -> last 20 bytes -> prepend 0x41 -> Base58Check -> T-address
```

The test suite verifies generated ETH addresses with `ethers` and generated TRX addresses with `TronWeb`.

## Download

Download the Windows portable package from the project Releases page:

```text
TRX_ETH_靓号地址生成器_便携版.zip
```

Unzip it and double-click:

```text
TRX_ETH_靓号地址生成器.exe
```

## Build From Source

```bash
npm install
npm start
```

Create a portable Windows package:

```bash
npm run package:portable
```

Run verification:

```bash
npm test
npm run verify:offline
```

## Security Model

- Runs locally as an Electron desktop app.
- Does not intentionally call network APIs.
- Does not upload private keys, mnemonics, addresses, or task history.
- Private-key encryption is optional and user-controlled.
- Plaintext export is available, but users should treat exported files as sensitive wallet material.

## Tech Stack

- Electron desktop shell
- Node.js worker threads
- `@noble/secp256k1`
- `ethers`
- `tronweb`
- `argon2`
- AES-256-GCM for encrypted private-key storage

## Disclaimer

This is a local key-generation tool. You are responsible for keeping private keys, mnemonics, result files, backups, and screenshots secure. Test with small or empty wallets before using generated addresses for real funds.
