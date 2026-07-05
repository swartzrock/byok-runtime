---
title: TypeScript Library Quality Gates
date: 2026-07-05
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

## Goal Capsule

Add standard formatting, linting, and package publication checks to `@swartzrock/byok-runtime` so the standalone TypeScript library has a reliable contributor and CI quality baseline before public review.

| Field             | Value                                                                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objective         | Introduce formatter, linter, package validation scripts, and CI wiring for the standalone BYOK Runtime repo.                                                                |
| Authority         | User request, existing `package.json` scripts, existing CI workflow, and package-readiness tests.                                                                           |
| Execution profile | Single-phase code/docs/test update on one branch and one PR.                                                                                                                |
| Stop conditions   | Stop if dependency installation cannot resolve, if new checks require changing public API behavior, or if package validation exposes a packaging defect outside this scope. |
| Tail ownership    | The implementing agent verifies locally, commits, pushes, opens the PR, and reports any CI gaps.                                                                            |

---

## Product Contract

### Summary

BYOK Runtime already has build, typecheck, example typecheck, and test gates. It now needs the baseline checks expected from a small public TypeScript library: deterministic formatting, type-aware linting, and package publication validation.

### Requirements

- R1. The repo exposes formatting scripts so contributors can format the library and CI can reject unformatted changes.
- R2. The repo exposes a type-aware lint script that catches common TypeScript library mistakes without changing runtime behavior.
- R3. The repo exposes package publication checks for packed contents, package metadata, and exported type compatibility.
- R4. CI runs the new quality gates alongside the existing build, typecheck, example typecheck, and test gates.
- R5. Contributor docs list the current local verification commands.
- R6. Package-readiness tests pin the new quality-gate scripts and config files so they do not disappear silently.

### Scope Boundaries

- This plan does not change public BYOK APIs, provider behavior, model lists, package name, or published entrypoints.
- This plan does not add browser tests or a dev server.
- This plan does not introduce CueCraft references.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Use Prettier for formatting because it is conventional for TypeScript libraries, works across TypeScript, JSON, Markdown, and YAML, and keeps the formatter independent from lint rules.
- KTD2. Use ESLint 9 flat config with `typescript-eslint` type-aware rules because this repo is TypeScript-only and already has strict `tsconfig` settings.
- KTD3. Add publication checks with `npm pack --dry-run`, `publint`, and `@arethetypeswrong/cli` because those cover packed file contents, package metadata, and consumer-facing type/export compatibility.
- KTD4. Keep CI as one job and add the new checks before and after build where they naturally fit: formatting and linting before build, package checks after build.

### Implementation Constraints

- Keep changes scoped to config, scripts, docs, tests, CI, and lint-driven cleanup.
- Preserve existing package manager choice (`bun@1.3.14`) and Node 24 baseline.
- Prefer fixing lint findings in place over weakening rules unless a rule conflicts with an intentional package pattern.

---

## Implementation Units

### U1. Add Formatter Gate

- **Goal:** Add Prettier configuration and package scripts for write/check workflows.
- **Requirements:** R1, R5, R6
- **Files:** `package.json`, `.prettierrc.json`, `.prettierignore`, `README.md`, `CONTRIBUTING.md`, `tests/package-readiness.test.ts`
- **Approach:** Configure Prettier to match the current tab-indented style, add `format` and `format:check` scripts, document the new command, and update the package-readiness test.
- **Test scenarios:** `bun run format:check` passes after formatting.
- **Verification:** `bun run format:check`, `bun run test`

### U2. Add Type-Aware Lint Gate

- **Goal:** Add ESLint configuration and a zero-warning lint script.
- **Requirements:** R2, R4, R6
- **Files:** `package.json`, `eslint.config.js`, `tsconfig.eslint.json`, `.github/workflows/ci.yml`, `tests/package-readiness.test.ts`, lint-affected TypeScript files
- **Approach:** Add ESLint 9 flat config using `@eslint/js` and `typescript-eslint`, add a lint-specific TS project that includes source, tests, and tool configs, enable type-aware TypeScript rules and consistent type imports, add `lint`, wire CI, and fix any findings without changing runtime behavior.
- **Test scenarios:** Lint fails on unused variables or unsafe async mistakes and passes for the current codebase.
- **Verification:** `bun run lint`, `bun run test`

### U3. Add Package Publication Gates

- **Goal:** Add package validation scripts for packed contents and public type/export compatibility.
- **Requirements:** R3, R4, R5, R6
- **Files:** `package.json`, `.npmrc`, `.github/workflows/ci.yml`, `README.md`, `CONTRIBUTING.md`, `tests/package-readiness.test.ts`
- **Approach:** Add `pack:check`, `publint`, and `attw` scripts; configure a repo-local npm cache for repeatable pack-based checks; document the scripts; run them after build in CI.
- **Test scenarios:** The package can be packed dry-run, passes `publint`, and passes `attw --pack`.
- **Verification:** `bun run build`, `bun run pack:check`, `bun run publint`, `bun run attw`

---

## Verification Contract

| Command                         | Covers                               | Done signal                                     |
| ------------------------------- | ------------------------------------ | ----------------------------------------------- |
| `bun install --frozen-lockfile` | Dependency and lockfile consistency  | Installs without lockfile changes               |
| `bun run format:check`          | U1                                   | Prettier reports all files formatted            |
| `bun run lint`                  | U2                                   | ESLint exits with zero warnings and errors      |
| `bun run build`                 | U3                                   | `dist` is generated for both public entrypoints |
| `bun run typecheck`             | Existing TS source gate              | Source typecheck passes                         |
| `bun run typecheck:examples`    | Public example imports               | Example typecheck passes                        |
| `bun run test`                  | Existing and package-readiness tests | Vitest suite passes                             |
| `bun run pack:check`            | U3                                   | npm dry-run pack succeeds                       |
| `bun run publint`               | U3                                   | Package metadata/export lint passes             |
| `bun run attw`                  | U3                                   | Public type/export compatibility passes         |

---

## Definition of Done

- U1 is done when formatter config exists, formatting scripts are documented, and `bun run format:check` passes.
- U2 is done when ESLint config exists, `bun run lint` is wired into CI, and lint passes without warnings.
- U3 is done when package publication scripts exist, are documented, run in CI, and pass locally after build.
- The branch is done when all Verification Contract commands pass or any unavailable external check is reported clearly, the plan file is included, the work is committed, pushed, and a PR is opened for review.
