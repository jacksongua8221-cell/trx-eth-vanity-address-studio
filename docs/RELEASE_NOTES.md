# Release Notes

## v0.1.0

Initial Windows portable release.

- Offline TRX / ETH vanity address generation.
- Standard wallet-importable private-key output.
- Optional mnemonic generation mode.
- Combined match rules and probability dashboard.
- NVIDIA GPU status panel.
- TXT result export.
- Separate suspicious vanity result folder.
- Optional encrypted private-key storage.

## Current main branch updates

- Added integrated vanity filtering tab with live suspicious-result sync and TXT import.
- Filter table now keeps long private keys and mnemonics compact and adds copy buttons.
- Address matches are highlighted in the filter table.
- Suspicious vanity rules are suffix-only and user configurable.
- Removed built-in ETH word suffixes such as `dead`, `beef`, and `cafe`.
- Added live CPU thread tuning while generation is running.
- Added CPU model, system memory, and Chinese `地址/秒` speed labels to the dashboard.
- Improved start, pause, resume, and stop status feedback.
- Fixed stop status being overwritten by the previous running state.
- Improved worker stats refresh so speed appears quickly even with large batches.
- Updated screenshots and README documentation.
