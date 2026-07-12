# @swartzrock/byok-runtime API Reference

This reference documents the public API exported by `@swartzrock/byok-runtime` and `@swartzrock/byok-runtime/node`.

Use only the public entrypoints:

```ts
import {
	ByokProvider,
	createByok,
	generateText,
	listModels,
	resolveByokEnvCredential,
} from "@swartzrock/byok-runtime";
import { createByokNodeProvider, findAvailableProviders } from "@swartzrock/byok-runtime/node";
```

Provider implementation files, model sorting helpers, Anthropic picker helpers, and setup-state helpers are package internals.

## `@swartzrock/byok-runtime`

The main entrypoint is the small trusted-runtime API for core providers. It avoids Node-only process APIs, but browser and Electron renderer UIs should call it through a trusted host boundary rather than importing BYOK directly with provider credentials.

Runtime exports:

- `ByokProvider`
- `BYOK_PROVIDER_IDS`
- `BYOK_PROVIDER_API_KEY_ENV_VARS`
- `isByokProviderId`
- `normalizeProviderId`
- `generateText`
- `createByok`
- `listModels`
- `resolveByokEnvCredential`
- `ByokProviderError`
- `ByokProviderRateLimitError`

Type exports include the public provider config, transport, model, generation, runtime, verification, and stored-settings types.

## `@swartzrock/byok-runtime/node`

The Node subpath re-exports the main entrypoint and adds runtime APIs for trusted Node or desktop backends:

- `createByokNodeProvider`
- `findAvailableProviders`
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

Cloud providers use `{ provider, apiKey, model, prompt }`, or `{ provider, credential: { source: "env", env }, model, prompt }` for trusted scripts that opt into BYOK's standard env var map. URL-backed local providers use `{ provider, model, prompt }` and accept optional `url`; Ollama defaults to `http://localhost:11434`, and LM Studio defaults to `http://localhost:1234/v1`. Both forms accept optional `deps` and `signal`.

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

`createByok` also accepts env-backed cloud credentials for trusted scripts:

```ts
const ai = createByok({
	provider: ByokProvider.OpenAI,
	credential: { source: "env", env: process.env },
});
```

### `listModels(options)`

Lists portable model options without requiring a selected model.

```ts
const models = await listModels({
	provider: ByokProvider.Anthropic,
	apiKey,
});
```

Cloud providers use `{ provider, apiKey }`, or `{ provider, credential: { source: "env", env } }` for trusted scripts. URL-backed local providers use `{ provider }` and accept optional `url`; Ollama defaults to `http://localhost:11434`, and LM Studio defaults to `http://localhost:1234/v1`. Both forms accept optional `deps`.

CLI model discovery is available from the Node runtime provider. Codex CLI shells out to `codex debug models`; Claude CLI fetches Anthropic model IDs from OpenRouter's public model list and strips the OpenRouter provider prefix.

### Env-backed credentials

Env-backed credentials are explicit at the call site. BYOK reads only the `env` object supplied by the caller; it does not import `process.env`, parse `.env` files, persist values, log values, or add env API-key support for local URL-backed providers.

```ts
const openaiKey = resolveByokEnvCredential(ByokProvider.OpenAI, {
	source: "env",
	env: process.env,
});
```

`BYOK_PROVIDER_API_KEY_ENV_VARS` contains the standard cloud-provider names: Anthropic `ANTHROPIC_API_KEY`, OpenAI `OPENAI_API_KEY`, Google `GOOGLE_API_KEY` then `GEMINI_API_KEY`, xAI `XAI_API_KEY`, and OpenRouter `OPENROUTER_API_KEY`.

## Node Runtime

### `findAvailableProviders({ env }, deps?)`

Performs lightweight provider discovery in fallback order: running Ollama and LM Studio servers, installed Codex and Claude CLIs, then cloud providers with keys in the supplied environment.

```ts
import { findAvailableProviders } from "@swartzrock/byok-runtime/node";

const providers = await findAvailableProviders({ env: process.env });
```

The result is an ordered array of provider IDs. Discovery checks reachability, executable files on the supplied `env.PATH` (without launching the CLIs), or key presence; callers should still use `listModels` or a provider runtime before treating a provider as authenticated and ready for generation. BYOK reads only the `env` object supplied by the caller.

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
	LmStudio = "lm-studio",
	CodexCli = "codex-cli",
	ClaudeCli = "claude-cli",
}
```

### Provider Inventory

`BYOK_PROVIDER_IDS` contains the supported provider IDs in stable order. Host applications own provider presentation, form fields, and settings copy.

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
