# @swartzrock/byok-runtime API Reference

This reference documents the public API exported by `@swartzrock/byok-runtime` and `@swartzrock/byok-runtime/node`.

Use only the public entrypoints:

```ts
import { ByokProvider, createByok, generateText, listModels } from "@swartzrock/byok-runtime";
import { createByokNodeProvider } from "@swartzrock/byok-runtime/node";
```

Provider implementation files, model sorting helpers, Anthropic picker helpers, and setup-state helpers are package internals.

## `@swartzrock/byok-runtime`

The main entrypoint is the small trusted-runtime API for core providers. It avoids Node-only process APIs, but browser and Electron renderer UIs should call it through a trusted host boundary rather than importing BYOK directly with provider credentials.

Runtime exports:

- `ByokProvider`
- `BYOK_PROVIDER_IDS`
- `byokProviderDefinition`
- `byokProviderDefinitions`
- `isByokProviderId`
- `normalizeProviderId`
- `generateText`
- `createByok`
- `listModels`
- `ByokProviderError`
- `ByokProviderRateLimitError`

Type exports include the public provider config, provider metadata, transport, model, generation, runtime, verification, and stored-settings types.

## `@swartzrock/byok-runtime/node`

The Node subpath re-exports the main entrypoint and adds runtime APIs for trusted Node or desktop backends:

- `createByokNodeProvider`
- `ClaudeCliProvider`
- `CodexCliProvider`
- `LocalCommandRunner`
- `extractClaudeCliOutput`
- `extractCodexCliOutput`
- Node-only CLI option and command-runner types

Use this subpath only where spawning local processes is acceptable.

## Function-First API

### `generateText(options)`

Generates text from one flat options object.

```ts
const { text } = await generateText({
	provider: ByokProvider.OpenAI,
	apiKey,
	model: "gpt-4o-mini",
	prompt: "Explain BYOK in one sentence.",
});
```

Cloud providers use `{ provider, apiKey, model, prompt }`. Ollama uses `{ provider: ByokProvider.Ollama, model, prompt }` and accepts optional `url` for non-default Ollama servers. Both forms accept optional `deps` and `signal`.

The function-first API intentionally accepts plain text prompts only. Use the node runtime when you need connection testing, JSON response hints, or structured object generation.

### `createByok(config)`

Creates a credential-bound client for repeated text generation. The model remains per call.

```ts
const ai = createByok({
	provider: ByokProvider.OpenAI,
	apiKey,
});

const { text } = await ai.generateText({
	model: "gpt-4o-mini",
	prompt: "Draft a short release note.",
});
```

`ByokClient` exposes only `generateText`.

### `listModels(options)`

Lists portable model options without requiring a selected model.

```ts
const models = await listModels({
	provider: ByokProvider.Anthropic,
	apiKey,
});
```

Cloud providers use `{ provider, apiKey }`. Ollama uses `{ provider: ByokProvider.Ollama }` and accepts optional `url` for non-default Ollama servers. Both forms accept optional `deps`.

CLI model discovery is available from the Node runtime provider. Codex CLI shells out to `codex debug models`; Claude CLI fetches Anthropic model IDs from OpenRouter's public model list and strips the OpenRouter provider prefix.

## Node Runtime

### `createByokNodeProvider(config, deps?)`

Creates a provider runtime for every provider, including Node-only CLI providers.

```ts
const provider = createByokNodeProvider(
	{
		provider: ByokProvider.OpenAI,
		apiKey,
		model: "gpt-4o-mini",
	},
	{ fetchImpl: fetch, http }
);
```

The runtime exposes connection testing, model listing, text generation, and optional structured object generation:

```ts
const status = await provider.testConnection();
const models = await provider.listModels();
const { text } = await provider.generateText({
	prompt: "Explain BYOK in one sentence.",
});
```

AI SDK based providers expose `generateObject`. Check for the method before calling it because Ollama and local CLI providers are text-only.

```ts
import { z } from "zod/v3";

if (!provider.generateObject) throw new Error("Structured output unavailable.");

const report = await provider.generateObject({
	prompt: "Return three risks of storing API keys in plaintext.",
	schema: z.object({
		risks: z.array(z.string()),
	}),
});
```

## Providers

### `ByokProvider`

Enum of supported provider IDs:

```ts
enum ByokProvider {
	Ollama = "ollama",
	Anthropic = "anthropic",
	OpenAI = "openai",
	Google = "google",
	Xai = "xai",
	OpenRouter = "openrouter",
	CodexCli = "codex-cli",
	ClaudeCli = "claude-cli",
}
```

### Provider Metadata

Use registry helpers for settings UIs and allowlists:

```ts
for (const provider of byokProviderDefinitions()) {
	console.log(provider.id, provider.label, provider.supportsModelListing);
}
```

`BYOK_PROVIDER_IDS` contains provider IDs in display order. `byokProviderDefinition(id)` returns metadata for one provider. The raw provider-definition map is not exported.

## Model Options

`listModels` and runtime `listModels()` return portable model options:

```ts
interface ByokModelOption {
	id: string;
	label: string;
}
```

Provider-specific metadata such as pricing, context length, supported parameters, or recommendation badges is intentionally not part of the public model option contract.

## Storage And Setup State

BYOK does not persist credentials, fetched model caches, setup verification, or app settings. Host apps own storage, encryption, migration, setup-state derivation, and UI-specific model sorting.

The package still exports public types such as `ByokStoredSettings`, `ByokVerificationSnapshot`, and `ByokSetupStatus` so apps can describe their own state, but mutation helpers are not part of the main public API.
