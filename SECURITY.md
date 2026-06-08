# Security Policy

This project is designed as a local offline wallet-key generation tool.

## Report a Security Issue

If you find a security problem, avoid posting private keys, mnemonics, result
files, screenshots with secrets, or crash dumps that contain wallet material.

## Private-Key Handling

- Treat every generated private key and mnemonic as real wallet material.
- Do not share result files publicly.
- Do not upload generated result files to issue trackers.
- Prefer testing with empty wallets before storing real funds.

## Offline Assumption

The app does not intentionally call network APIs. You can run:

```bash
npm run verify:offline
```

to scan the source tree for direct network API usage.
