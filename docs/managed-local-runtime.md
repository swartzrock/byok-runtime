# Managed-local macOS runtime gate

Status: **blocked for distribution** as of 2026-08-12.

The pinned upstream runtime is byte-for-byte reproducible and runs from its complete quarantined bundle on the tested host, but it does not pass Apple's Gatekeeper or notarization assessment. It is therefore a verified candidate, not the shippable `managed-local` runtime. Do not enable runtime downloads in a release until a Developer ID signed and notarized fallback asset completes this gate on a clean Apple Silicon Mac.

## Pinned candidate

| Field                 | Value                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Project               | [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp)                                                                |
| Release               | `b10369`                                                                                                                   |
| Source commit         | `6e62ba538478202094edc6c100c782719e310aa3`                                                                                 |
| Asset                 | `llama-b10369-bin-macos-arm64.tar.gz`                                                                                      |
| Download              | [GitHub release asset](https://github.com/ggml-org/llama.cpp/releases/download/b10369/llama-b10369-bin-macos-arm64.tar.gz) |
| Bytes                 | `11,069,404`                                                                                                               |
| SHA-256               | `de2ac2c0a7cc245bce2411393658ff19c9c00d9d1fe37c5dfe94668c0d7bc01f`                                                         |
| Upstream license file | `llama-b10369/LICENSE` (MIT)                                                                                               |
| Expected version      | `version: 10369 (6e62ba538)`                                                                                               |

The archive must be installed as a complete bundle. `llama-server` dynamically loads sibling libraries, including `libllama-server-impl.dylib`, `libllama-common`, `libllama`, and the GGML CPU, Metal, base, and BLAS libraries. Preserve the archive's files and symlink graph together. Copying only `llama-server` is unsupported and fails before startup.

## Reproduce the gate

Run this only on a standard, clean macOS arm64 host. The command is opt-in: it downloads the pinned 11 MB runtime into a system temporary directory, but it does not download a model.

```sh
bun run scripts/managed-local-runtime-smoke.ts
```

To avoid the runtime download, supply an archive obtained separately:

```sh
bun run scripts/managed-local-runtime-smoke.ts \
  --archive /absolute/path/llama-b10369-bin-macos-arm64.tar.gz
```

The script performs these checks in order:

1. Refuses non-macOS or non-arm64 hosts before download or extraction.
2. Verifies the exact archive byte count and SHA-256 digest.
3. Checks the archive for the executable, license, and required sibling libraries before extraction.
4. Extracts the complete bundle under the system temporary directory.
5. Applies `com.apple.quarantine` recursively and verifies it remains on `llama-server`. It never clears quarantine.
6. Records `codesign` details and strict verification, notarization, and `spctl --assess --type execute` results.
7. Runs the quarantined executable's `--version` and verifies the pinned build.
8. Proves a separated executable cannot run without the bundle.
9. Emits a JSON evidence record and exits nonzero unless Gatekeeper and notarization both accept the executable.

Temporary files are removed after the run. Pass `--keep-work-directory` when a release reviewer needs to inspect the exact quarantined tree; the JSON report gives its location. Never point that temporary location into the repository.

### Optional authenticated model load

A model load is deliberately separate and never automatic. Supply a local GGUF only after verifying its catalog identity independently:

```sh
bun run scripts/managed-local-runtime-smoke.ts \
  --archive /absolute/path/llama-b10369-bin-macos-arm64.tar.gz \
  --model /absolute/path/Qwen3-0.6B-Q8_0.gguf
```

The smoke starts the quarantined sidecar on loopback with a private API-key file, offline mode, no Web UI, and a small test context. It requires unauthenticated `/v1/models` to return `401`, then requires the authenticated response to expose the expected smoke alias. The model is neither copied into nor removed by the script.

## Recorded candidate result

The following evidence was collected on 2026-08-12 on Apple Silicon:

| Check                                               | Result                                                         |
| --------------------------------------------------- | -------------------------------------------------------------- |
| macOS                                               | `15.7.7 (24G720)`                                              |
| Architecture                                        | `arm64`                                                        |
| Archive size and SHA-256                            | Match                                                          |
| Complete bundle `--version` with quarantine present | Pass; reports build `10369 (6e62ba538)`                        |
| Separated executable                                | Fails loading `@rpath/libllama-server-impl.dylib`, as required |
| Code signature                                      | Linker/ad-hoc; no `TeamIdentifier`                             |
| `codesign --verify --deep --strict`                 | Pass                                                           |
| `codesign -R=notarized --check-notarization`        | Fail: code does not satisfy the notarized requirement          |
| `spctl --assess --type execute --verbose=4`         | Fail: `internal error in Code Signing subsystem`               |
| Model load                                          | Not run; no local model was supplied                           |

Direct CLI execution succeeding does not override the failed policy assessments. Apple documents `spctl` as a way to test whether a command-line tool will run under current system policy and requires a Developer ID Application certificate for distributed command-line tools. See [Resolving common notarization issues](https://developer.apple.com/documentation/security/resolving-common-notarization-issues) and [Developer ID](https://developer.apple.com/developer-id/).

This host was not a clean release-test machine, so its successful direct execution is diagnostic only. A clean-host result cannot make the current ad-hoc asset shippable while the policy and notarization checks fail.

## Required fallback

The next release step needs authority and infrastructure not present in this repository checkout:

- Apple Developer Program access and a `Developer ID Application` signing identity.
- Notarization credentials suitable for unattended release automation.
- A project-controlled immutable release-asset location.
- A reproducible build of the same pinned source commit.
- Bottom-up signing of every executable and dynamic library, followed by notarization of the distributed archive and a new pinned byte count and SHA-256 digest.
- A clean macOS arm64 run of this smoke with Gatekeeper and notarization accepted while quarantine remains.

No signing or notarization automation is included without those credentials and the publishing-location decision. Once a fallback exists, retain both the upstream source identity and the project-owned distribution identity in the runtime manifest.
