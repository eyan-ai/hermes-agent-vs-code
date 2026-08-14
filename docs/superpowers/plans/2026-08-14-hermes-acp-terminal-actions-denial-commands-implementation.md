# Hermes ACP Terminal Actions, Denial, and Commands Implementation Plan

## 1. ACP renderer terminal states

- Add tests for successful, failed, and cancelled orphan Actions.
- Reconcile only still-running Actions when the turn reaches a terminal state.
- Preserve explicit ACP tool results and continuation ownership.

## 2. Hard denial lifecycle

- Extract testable queue/denial state helpers where practical.
- Make a preset denial cancel the active permission batch immediately.
- Clear prompts owned by the rejected turn and remove denial-path draining.
- Preserve custom-feedback continuation behavior.

## 3. Command registry and dispatch

- Replace the unverified CLI catalog with executable local commands plus ACP-advertised commands.
- Preserve Skills as Agent turns and preserve `/steer` behavior.
- Add host-side command dispatch before ordinary prompt resolution.
- Add minimal command notices and `/save` snapshot export.
- Reject unknown commands without sending them to the model.

## 4. Verification and package

- Run focused tests after each subsystem.
- Run the full unit suite, syntax checks, and diff checks.
- Bump the prerelease version, package a new VSIX, inspect its manifest and runtime hashes, and report the stable absolute path and SHA-256.
