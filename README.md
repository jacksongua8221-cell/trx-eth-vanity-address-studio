# TRX / ETH Vanity Address Studio

Offline Windows desktop tool for generating TRX and ETH vanity addresses. It focuses on valid wallet-importable keys, local-only operation, clear probability stats, and practical result management.

[中文说明](./README.zh-CN.md) | [Releases](https://github.com/jacksongua8221-cell/trx-eth-vanity-address-studio/releases)

> Local only. No private keys, mnemonics, addresses, task records, or generated results are uploaded.

![Main window](./docs/images/main-window.png)

## Highlights

- Supports **TRX** and **ETH** vanity address generation.
- Generates standard wallet-importable `secp256k1` private keys.
- ETH addresses are derived with Keccak-256 and displayed as checksum addresses.
- TRX addresses follow mainnet rules: public key -> Keccak-256 -> last 20 bytes -> `0x41` prefix -> Base58Check.
- Supports private-key generation and mnemonic generation modes.
- TXT output can save private keys, mnemonics, or both when mnemonic mode is enabled.
- Match modes include prefix, suffix, contains, prefix + suffix, prefix + contains, contains + suffix, prefix + contains + suffix, and smart recognition.
- Suspicious vanity detection is suffix-only: repeated suffixes, numeric sequences, `abcde` / `edcba`, and user-defined suffixes.
- Integrated vanity filter tab supports live sync from generated suspicious results and TXT import.
- Filter results keep long private keys and mnemonics compact, with copy buttons for address, private key, and mnemonic.
- CPU thread count can be changed while running.
- The app reads local CPU info and suggests a thread range for the current machine.
- Runtime status updates immediately for start, pause, resume, and stop.
- Worker stats report quickly so speed and attempts react without waiting for a large batch to finish.
- NVIDIA GPU status monitoring is included for GPU name, usage, memory, temperature, and power. Current generation uses CPU workers.
- Probability dashboard shows difficulty, attempts, hit probability, and estimated 50% / 90% / 99% hit times.
- Optional encrypted private-key storage remains user-controlled; plaintext TXT export is available with risk warning.

## Screenshots

Generated TRX suffix `8888` example:

![Generated result](./docs/images/jg.png)

Donation address:

```text
TEmivtvDDCqiaNW4NvX9B6ngYz9f9U8888
```

![TRX donation QR](./docs/images/trx.jpg)

## Output Files

Target hits and suspicious hits are stored separately.

```text
results/results.txt
results/suspicious/suspicious.txt
```

TXT lines contain only selected wallet data, for example:

```text
address private_key
address private_key mnemonic words...
```

## Verification

The test suite verifies:

- ETH private key and address matching with `ethers`.
- TRX private key and address matching with `TronWeb`.
- Wallet-import private-key format.
- Optional mnemonic generation.
- Encryption and wrong-password rejection.
- Checkpoint save and restore behavior.
- Suffix-only suspicious vanity rules.
- Offline source scan for direct network APIs.

Run locally:

```bash
npm install
npm test
npm run verify:offline
```

Package portable Windows build:

```bash
npm run package:portable
```

## Download

Download the portable Windows build from [GitHub Releases](https://github.com/jacksongua8221-cell/trx-eth-vanity-address-studio/releases), or build locally with the package command above.

The local build outputs:

```text
release/TRX_ETH_靓号地址生成器_便携版.zip
```

## Security Notes

- This tool is designed for local offline use.
- Treat generated private keys and mnemonics as real wallet credentials.
- Do not share result files, screenshots containing keys, or exported TXT files.
- Test wallet import with an empty wallet before using generated addresses for real assets.
- GPU status monitoring does not mean GPU generation is enabled; generation currently runs on CPU workers.

## License

MIT
