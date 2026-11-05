# Portable Offline Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers activate all three clients by signed code without a device request, while the issuer can sign on another Windows PC using a separately encrypted private-key archive.

**Architecture:** Keep `PSA1` packaging and signature algorithm. New signed payloads carry explicit portable scope and the old signed device-bound payloads retain their original validator. The issuer GUI password is a convenience gate only; the signing key remains separate and never enters a release.

**Tech Stack:** Web Crypto ECDSA P-256, C# WinForms/.NET Framework 4.8 CNG, PowerShell build scripts, Node QA.

**Spec:** `docs/superpowers/specs/2026-11-04-physics-content-portable-activation-design.md`

## Global Constraints

- Preserve legacy device-bound `PSA1` code acceptance and every public-key object property.
- Never commit plaintext management password, signing private key, PFX, or unencrypted secret.
- No false one-device/one-time claim for portable offline codes; validity is signed and time-limited where selected.
- No student records, question IDs, state v10 or `.pslab` format change.

## Review Focus

- Device-bound old code still rejects another device even though new portable code does not (Task 1).
- Tampering `scope`, expiration or `kid` fails verification (Task 1).
- A new machine without the encrypted archive cannot issue, regardless of GUI password (Task 2).
- Bad archive password, missing archive and damaged PFX do not silently generate a new trusted key (Task 2).
- A released package contains neither issuer secret nor plaintext management password (Task 3).

---

### Task 1: Portable verifier with legacy separation

**Files:** Modify `activation.js`, `activation-public-key.js`; create `tools/qa_portable_activation.cjs`.

**Interfaces:** `validateCode(rawCode, expectedDeviceId)` accepts signed `scope:'portable'` codes without device equality; old scope-absent v1 codes still require normalized device match. Both enforce product, signed issuance/expiry and 64-byte P1363 signature.

- [ ] Write QA for old/new code, wrong device on old code, portable on two device IDs, invalid signature, expired code and unknown scope.
- [ ] Run QA; expected failure is new portable scope rejected.
- [ ] Extend only signed payload allowlist and trusted public keys; update gate wording without changing visual style.
- [ ] Run QA and current activation UI/Node QA; expected pass.
- [ ] Commit task files with `feat: verify signed portable activation codes`.

### Task 2: Secure issuer portability and requested GUI gate

**Files:** Modify `ActivationManager.cs`, `tools/build_activation_manager.ps1`, `tools/qa_activation_manager.cs`, `tools/qa_activation_manager.ps1`; add a public-key export/migration fixture only (never private key).

**Interfaces:** `IssuePortable(int? validityDays,string note)` signs the new scope; `--issue-portable [days] [note]`, `--verify <code> [deviceId]`; separate encrypted PFX import command opens a known issuer key, rejects wrong password, and never silently falls back. GUI unlock validates a salted PBKDF2 verifier of the user-specified password, but key access requires the separate archive/CNG key.

- [ ] Write C# QA for portable lifetime and signature, historical device-bound verification, GUI gate wrong/correct password, PFX restore to a fresh key context, and non-exported password/private-key material.
- [ ] Run QA; expected failure is missing portable issuance/import APIs.
- [ ] Implement minimal compatible issuance/import and GUI gate; do not embed plaintext password or PFX in source/binary.
- [ ] Run manager QA and build; expected pass on Windows with available .NET Framework toolchain.
- [ ] Commit task files with `feat: issue portable codes with protected key recovery`.

### Task 3: Three-client parity and release safety

**Files:** Modify `README.md`, build scripts or release manifests only as necessary; create `tools/qa_activation_release_parity.cjs`, stage outputs `docs/activation-release-verification.md`.

**Interfaces:** Windows, student APK and teacher APK contain the same verifier and public-key set; issuer archive is excluded from all packages and git.

- [ ] Write parity QA that inspects actual build outputs and fails for differing activation JS/public-key hashes or secret artifacts.
- [ ] Run QA against existing packages; expected failure is portable verifier absent/mismatch.
- [ ] Build all three candidates, run full QA, verify SHA-256 and artifact contents, and label unsigned builds as development candidates.
- [ ] Commit docs/packaging changes with `build: verify portable activation across three clients`.
