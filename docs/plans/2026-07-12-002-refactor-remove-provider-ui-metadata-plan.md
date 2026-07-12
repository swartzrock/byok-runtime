---
title: "refactor: Remove provider UI metadata"
date: 2026-07-12
type: refactor
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
origin: docs/plans/2026-07-12-001-refactor-executable-provider-manifest-plan.md
---

# refactor: Remove provider UI metadata

## Goal Capsule

- **Objective:** Make the executable provider manifest strictly operational and remove the settings-UI definition contract from the package's public API.
- **Authority:** This plan supersedes the earlier plan's public-export compatibility requirements for the provider-definition helpers and all provider presentation/form metadata types removed by R5.
- **Execution profile:** One focused phase on the existing executable-manifest branch and pull request.
- **Stop conditions:** Provider runtime behavior, provider ID ordering/types, setup-status classification, or icon inventory parity regresses.
- **Tail ownership:** LFG verifies, reviews, commits, pushes, updates the existing pull request, and watches CI.

---

## Product Contract

### Summary

`byok-runtime` is a runtime library, not a provider-settings UI framework. Provider presentation copy and form schemas belong in host applications. The manifest should retain only data used to select and execute providers, while the existing icon source file remains in the repository as an explicit temporary exception.

### Problem Frame

The executable manifest introduced a nested provider definition containing labels, placeholders, descriptions, form behavior, and setup messages inherited from the library's former application context. This duplicates host-owned presentation concerns, conflicts with the repository's app-agnostic boundary, and makes provider additions carry unrelated UI copy.

### Requirements

- R1. `src/provider-manifest.ts` contains no credential-field, model-field, placeholder, form-message, display-product, or capability metadata intended for settings UI construction.
- R2. The manifest retains provider ID/family inventory, cloud environment-variable names, cloud transport configuration, model normalization, and exact cloud label/vendor strings used by runtime diagnostics.
- R3. `BYOK_PROVIDER_IDS`, `isByokProviderId`, and `normalizeProviderId` remain public with their current behavior and literal types; provider-definition registry values and the UI metadata type exports identified in R5 are removed.
- R4. Setup status classifies cloud and CLI providers from manifest-backed family helpers without duplicating provider ID lists or depending on UI definitions.
- R5. The root package no longer exports provider-definition, credential/model field, credential/model behavior, or icon presentation types.
- R6. `src/provider-icons.ts` remains byte-for-byte unchanged and internal; tests retain exact icon-to-provider inventory parity.
- R7. Published documentation stops advertising the library as a provider-settings UI metadata source and accurately lists the remaining public API.
- R8. The intentional public API removal is documented in a major changeset for `@swartzrock/byok-runtime`.

### Acceptance Examples

- AE1. Given a root-package consumer, importing `BYOK_PROVIDER_IDS`, `isByokProviderId`, or `normalizeProviderId` still works, while `byokProviderDefinition` and `byokProviderDefinitions` are absent.
- AE2. Given an Anthropic cloud configuration, provider construction still reports `Anthropic (Claude)` and uses the existing vendor, base URL, auth headers, and model normalization.
- AE3. Given stored cloud, local-server, and CLI settings, setup-state derivation preserves credential-saved behavior and the CLI default-model sentinel behavior.
- AE4. Given the retained icon map, its keys exactly match the ordered manifest provider inventory even though runtime code does not consume icons.

### Scope Boundaries

- Keep runtime/provider labels that are part of `ByokProviderRuntime` diagnostics; removing runtime labels is not part of this refactor.
- Keep `src/provider-icons.ts` and its internal icon type declarations for now; do not delete, rewrite, or relocate them.
- Do not expose `BYOK_PROVIDER_MANIFEST` through the package root.
- Do not add deprecation shims for the removed definition APIs because they would preserve the UI contract being removed.
- Do not add providers or change provider URLs, authentication, model discovery, generation, or credential resolution behavior.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Keep `src/registry.ts` as the ordered ID and normalization module, but delete the definition/icon join and definition lookup functions.
- KTD2. Use the manifest's existing discriminated `family` field as operational classification. Reuse `isCloudProviderId` and add a manifest-derived CLI guard for setup status.
- KTD3. Move exact cloud `label` and `vendor` values into cloud runtime metadata because the cloud factory consumes them for runtime diagnostics; local and CLI entries need only their operational family and ID.
- KTD4. Preserve the const-generic ID tuple and mapped cloud manifest/env-var construction so public literal types do not widen.
- KTD5. Retain internal icon inventory coverage without reconnecting icons to runtime metadata.

### Assumptions

- “Remove registry APIs” means provider-definition APIs, not the ID guard and legacy-ID normalization utilities that runtime consumers still need.
- Icon definition types may remain module exports for `src/provider-icons.ts`, but they are removed from the package root barrel along with the other UI-facing types.
- The existing `feat/executable-provider-manifest` pull request is the correct landing place because this refines the unmerged manifest design.

### System-Wide Impact

This is a source-level breaking change for consumers of the definition helpers and UI metadata types. Runtime construction and setup-state behavior must remain unchanged. Documentation and the changeset are part of the same atomic correction so downstream consumers receive an explicit migration signal: host applications now own provider presentation metadata.

### Risks and Mitigations

- **Literal type widening:** Preserve existing generic/mapped-type helpers and compile-time fixtures.
- **Diagnostic behavior drift:** Assert exact cloud runtime label/vendor and transport metadata in manifest/factory tests.
- **Setup-state drift:** Run the full setup-status suite after replacing credential-kind classification with family guards.
- **Accidental icon deletion:** Leave `src/provider-icons.ts` untouched and keep key-parity coverage.
- **Incomplete public break:** Use the exact public export contract test, barrel-source assertions, docs updates, and a major changeset.

### Phased Delivery

#### Phase 1. Remove UI metadata and update the existing manifest PR

Complete U1 through U4 on `feat/executable-provider-manifest`, verify the full package contract, commit, push, update pull request #24, and drive CI to a decided green state.

---

## Implementation Units

### U1. Reduce the manifest to operational metadata

- **Goal:** Remove the nested UI definition schema while preserving executable provider data and literal typing.
- **Requirements:** R1, R2, R4, R6; AE2, AE4.
- **Dependencies:** None.
- **Files:** `src/provider-manifest.ts`, `src/providers/provider-factory.ts`, `tests/provider-manifest.test.ts`, `tests/provider-factory.test.ts`.
- **Approach:** Keep family/id on all entries; keep environment variables and runtime transport data on cloud entries; place exact cloud label/vendor diagnostics in cloud runtime metadata; add a manifest-derived CLI guard; leave the icon file untouched and assert operational shape plus icon parity.
- **Execution note:** Update focused manifest/factory tests first so old definition assumptions fail before implementation changes.
- **Patterns to follow:** Existing discriminated manifest union, const-preserving mapped cloud manifest, exhaustive auth/model-normalization switches.
- **Test scenarios:**
  - Covers AE2. Each cloud entry retains its exact label, vendor, HTTPS base URL, auth strategy, model normalization, and environment-variable tuple.
  - Covers AE4. Manifest IDs remain ordered and unique, and icon keys remain an exact set match.
  - Every entry lacks a `definition` field; non-cloud entries lack cloud runtime and env-var fields.
  - Cloud provider construction preserves observable runtime label and provider-specific transport behavior.
- **Verification:** Focused manifest and provider-factory tests pass without changes to runtime outputs or `src/provider-icons.ts`.

### U2. Remove definition dependencies from registry and setup status

- **Goal:** Preserve provider ID utilities and setup behavior without UI definition metadata.
- **Requirements:** R3, R4; AE1, AE3.
- **Dependencies:** U1.
- **Files:** `src/registry.ts`, `src/setup-status.ts`, `tests/setup-status.test.ts`, `tests/provider-manifest.test.ts`.
- **Approach:** Delete the definition/icon join and definition lookup functions from the registry. Classify cloud and CLI setup behavior through manifest-backed guards after validating unknown provider values with `isByokProviderId`.
- **Patterns to follow:** Existing provider guard functions and setup-status pure helper structure.
- **Test scenarios:**
  - Covers AE3. Saved cloud credentials, local URL credentials, and CLI command credentials produce the same setup status as before.
  - Covers AE3. An empty CLI model still uses the default-model sentinel for connection freshness.
  - Unknown and legacy provider strings retain current validation and normalization outcomes.
- **Verification:** The setup-status suite passes and no provider list is duplicated outside the manifest.

### U3. Remove the public UI metadata contract

- **Goal:** Delete the value and type exports that make the runtime library a settings-UI schema source.
- **Requirements:** R3, R5; AE1.
- **Dependencies:** U1, U2.
- **Files:** `src/types.ts`, `src/index.ts`, `tests/public-contract.test.ts`, `tests/fixtures/main-entrypoint.ts`.
- **Approach:** Remove provider-definition and credential/model form types; stop root-exporting icon presentation types; remove definition functions from the barrel; preserve the exact remaining runtime export list and literal provider/env-var types.
- **Execution note:** Treat the exact root export test and compile-time fixtures as the red/green boundary for this breaking API cleanup.
- **Patterns to follow:** Existing exact `Object.keys` public-contract assertion and entrypoint type fixture.
- **Test scenarios:**
  - Covers AE1. Root runtime exports contain ID helpers and runtime APIs but no definition helpers.
  - Removed UI type names are absent from the root barrel while runtime/config/icon-internal code still typechecks.
  - `BYOK_PROVIDER_IDS` and `BYOK_PROVIDER_API_KEY_ENV_VARS` retain their literal tuple/map types.
- **Verification:** Source and example typechecks pass and the public contract exposes only the intended runtime API.

### U4. Document the host-owned UI boundary and breaking release

- **Goal:** Align published documentation and release metadata with the reduced runtime API.
- **Requirements:** R7, R8.
- **Dependencies:** U3.
- **Files:** `README.md`, `API.md`, `.changeset/<generated-name>.md`.
- **Approach:** Remove the provider-settings UI example and definition API references, describe `BYOK_PROVIDER_IDS` as the supported-provider inventory, and add a major changeset naming the removed value and type exports and the host-owned presentation boundary.
- **Patterns to follow:** Existing README/API public-entrypoint examples and Changesets format.
- **Test scenarios:** Documentation examples contain no removed imports; package checks accept the major changeset.
- **Verification:** Documentation contract tests and package verification pass with no stale definition API references outside historical plan/ideation artifacts.

---

## Verification Contract

| Gate                          | Coverage                                                        | Done signal                                                            |
| ----------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Focused Vitest                | Manifest, factory, setup status, public contract                | Operational metadata and preserved behavior pass before the full suite |
| Source and example typechecks | Public value/type surface and literal types                     | No UI definition exports and no type widening                          |
| Full `bun run check`          | Format, lint, build, typechecks, all tests, pack, publint, attw | Required repository gate passes                                        |
| Diff audit                    | Icon preservation and scope                                     | `src/provider-icons.ts` has no diff; no unrelated changes              |
| GitHub CI                     | Published package matrix                                        | Pull request #24 reaches a decided green state                         |

---

## Definition of Done

- The manifest contains only operational provider inventory and cloud execution metadata.
- Provider-definition functions and all root-exported UI metadata types are removed.
- Provider IDs, normalization, env credentials, runtime labels/transports, setup status, and icon inventory parity are preserved.
- `src/provider-icons.ts` is unchanged.
- README and API reference contain no stale settings-definition guidance.
- A major changeset describes the breaking public API removal.
- The full local verification contract and pull request CI pass.

---

## Appendix

### Sources and Research

- `CONTRIBUTING.md` establishes that host apps own UI, prompting, validation, storage, and secret handling.
- `src/provider-manifest.ts`, `src/registry.ts`, `src/setup-status.ts`, and `src/providers/provider-factory.ts` define the current dependency flow.
- `tests/provider-manifest.test.ts`, `tests/public-contract.test.ts`, and `tests/setup-status.test.ts` provide the relevant behavior and package-boundary coverage.
- No `docs/solutions/` or `CONCEPTS.md` corpus exists; current code and repository conventions are the primary grounding.
- External research was skipped because this is an internal boundary correction with strong local patterns and no unsettled external dependency.
