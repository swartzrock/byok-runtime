# Changelog

## 2.0.0

### Major Changes

- 03ea338: Remove provider settings UI metadata and the `byokProviderDefinition` and `byokProviderDefinitions` APIs. This also removes the public `ByokProviderDefinition`, `ByokCredentialFieldDefinition`, `ByokCredentialKind`, `ByokModelBehavior`, `ByokModelFieldDefinition`, `ByokProviderIconDefinition`, and `ByokProviderIconSource` type exports. Host applications now own provider presentation, form fields, icons, and settings copy.

### Minor Changes

- 979095d: Add Groq, Mistral, DeepSeek, and DeepInfra as cloud providers using BYOK Runtime's OpenAI-compatible chat-completions and model-listing support, and remove the unused internal provider-icon assets.

## 1.1.0

### Minor Changes

- 7466e52: Add ordered provider discovery to the Node runtime for local servers, installed AI CLIs, and environment-backed cloud providers.

## 1.0.0

### Major Changes

- fed7e88: Initial stable release of BYOK Runtime, with unified provider generation, model discovery, environment-backed credentials, local runtimes, and stable public entrypoints, plus helpful docs to get started quickly.

### Patch Changes

- fdb714d: Improve the npm package page with a faster quick start, clearer runtime requirements, consolidated provider guidance, and expanded search metadata.

## 0.3.0

### Minor Changes

- 5d19dc9: testing minor changesets

## 0.2.0

### Minor Changes

- cf1d2ce: new description and testing changesets to prepare for npm release

## 0.1.0

- Initial public package migration for `@swartzrock/byok-runtime`.
- Supports API-key providers, Ollama, Codex CLI, Claude CLI, model discovery, text generation, and structured-object generation where providers support it.
- Added LM Studio as a local URL-backed provider with OpenAI-compatible model listing, text generation, and object-like JSON parsing.
