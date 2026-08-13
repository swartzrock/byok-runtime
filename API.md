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
	streamText,
} from "@swartzrock/byok-runtime";
import { createByokNodeProvider, findAvailableProviders } from "@swartzrock/byok-runtime/node";
```

Provider implementation files, model sorting helpers, Anthropic picker helpers, and setup-state helpers are package internals.

## `@swartzrock/byok-runtime`

The main entrypoint is the small trusted-runtime API for core providers. It avoids Node-only process APIs, but browser and Electron renderer UIs should call it through a trusted host boundary rather than importing BYOK directly with provider credentials.

Runtime exports:

- `ByokProvider`
- `BYOK_PROVIDER_IDS`
- `BYOK_API_KEY_ENV_VARS`
- `BYOK_PROVIDER_API_KEY_ENV_VARS`
- `isByokProviderId`
- `normalizeProviderId`
- `generateText`
- `streamText`
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
	instructions: "Answer for a technical audience. Be concise.",
	prompt: "Explain BYOK in one sentence.",
});
```

Cloud providers use `{ provider, apiKey, model, prompt }`, or `{ provider, credential: { source: "env", env }, model, prompt }` for trusted scripts that opt into BYOK's standard env var map. URL-backed local providers use `{ provider, model, prompt }` and accept optional `url`; Ollama defaults to `http://localhost:11434`, and LM Studio defaults to `http://localhost:1234/v1`. Both forms accept optional `instructions`, `deps`, and `signal`.

The function-first API requires a plain-text user `prompt` and optionally accepts plain-text `instructions`. Instructions are sent through the provider's separate system/developer channel and are never concatenated into the prompt. Use the node runtime when you need connection testing, JSON response hints, or structured object generation.

### `streamText(options)`

Returns a lazy, single-consumer text stream without changing `generateText` behavior.

```ts
const { delivery, textStream } = streamText({
	provider: ByokProvider.OpenAI,
	apiKey,
	model: "gpt-4o-mini",
	prompt: "Explain BYOK in one paragraph.",
});

let text = "";
for await (const delta of textStream) text += delta;
```

The return value is `ByokTextStream`:

```ts
interface ByokTextStream {
	readonly delivery: "native" | "buffered";
	readonly textStream: AsyncIterable<string>;
}
```

The request begins on the first iterator read. `"native"` means the provider supplies progressive
deltas; `"buffered"` means the adapter emits one completed delta. Concatenating every delta
reconstructs the exact generated text. Verified OpenAI-compatible routes and Ollama's fetch-backed
transport use native delivery. Codex CLI, Claude CLI, and unsupported custom transports use
buffered delivery.

The caller's optional `signal` and iterator lifetime share cancellation. Aborting the signal,
calling `return()`, or breaking from `for await` aborts the underlying request or local process.
Rate-limit retries are allowed only before the first emitted text delta. Streams can be consumed
once, retain the default response-size limit, and preserve instructions separately from the prompt.

### `createByok(config)`

Creates a credential-bound client for repeated text generation. The model remains per call.

```ts
const ai = createByok({
	provider: ByokProvider.OpenAI,
	apiKey,
});

const { text } = await ai.generateText({
	model: "gpt-4o-mini",
	instructions: "Use release-note style and active voice.",
	prompt: "Draft a short release note.",
});
```

The client returned by `createByok` exposes both `generateText` and `streamText`; the model remains
per call for both methods.

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

`BYOK_API_KEY_ENV_VARS` contains the supported names as a flat, stably ordered list for callers that need to inspect or filter environment keys. `BYOK_PROVIDER_API_KEY_ENV_VARS` groups the same names by cloud provider and preserves credential fallback order: Anthropic `ANTHROPIC_API_KEY`, OpenAI `OPENAI_API_KEY`, Google `GOOGLE_API_KEY` then `GEMINI_API_KEY`, xAI `XAI_API_KEY`, OpenRouter `OPENROUTER_API_KEY`, Groq `GROQ_API_KEY`, Mistral `MISTRAL_API_KEY`, DeepSeek `DEEPSEEK_API_KEY`, and DeepInfra `DEEPINFRA_TOKEN`.

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
	instructions: "Answer for a technical audience. Be concise.",
	prompt: "Explain BYOK in one sentence.",
});
```

Built-in runtimes also expose `streamText`. The method remains optional on the public provider
runtime interface so existing custom runtime implementations stay source-compatible.

`ByokTextGenerationInput`, `ByokClientTextGenerationInput`, and the function-first generation options all keep `prompt` required and expose `instructions?: string`. Omitted instructions do not add an empty message, request property, or CLI argument.

AI SDK based providers expose `generateObject`. Check for the method before calling it because Ollama and local CLI providers are text-only. `ByokObjectGenerationInput<T>` keeps `prompt` and `schema` required and exposes the same optional `instructions?: string` as text generation.

```ts
import { z } from "zod/v3";

if (!provider.generateObject) throw new Error("Structured output unavailable.");

const report = await provider.generateObject({
	instructions: "Remain faithful to the supplied source material.",
	prompt: "Return three risks of storing API keys in plaintext.",
	schema: z.object({
		risks: z.array(z.string()),
	}),
});
```

Providers exposing `generateObject` send instructions through the same native channel as text generation. Instructions remain separate from the generated schema prompt, and validation-repair attempts retain the original instructions unchanged.

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
	Groq = "groq",
	Mistral = "mistral",
	DeepSeek = "deepseek",
	DeepInfra = "deepinfra",
	LmStudio = "lm-studio",
	CodexCli = "codex-cli",
	ClaudeCli = "claude-cli",
}
```

### Provider Inventory

`BYOK_PROVIDER_IDS` contains the supported provider IDs in stable order. Host applications own provider presentation, form fields, and settings copy.

Groq, Mistral, DeepSeek, and DeepInfra use BYOK's existing OpenAI-compatible chat-completions and `/models` subset. Support does not extend to every OpenAI API or provider-specific capability.

### Instruction Channels

| Providers                                                                                 | Instruction channel                               |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Anthropic, OpenAI, Google, xAI, OpenRouter, Groq, Mistral, DeepSeek, DeepInfra, LM Studio | OpenAI-compatible `system` message                |
| Ollama                                                                                    | Native `system` request field                     |
| Claude CLI                                                                                | `--append-system-prompt` (keeps Claude's default) |
| Codex CLI                                                                                 | Per-run `developer_instructions` config           |

Every built-in text provider supports a separate instruction channel, and providers exposing `generateObject` use that same channel. Provider adapters must not concatenate instructions into the user prompt, including generated schema or repair text. Object-generation repair attempts retain the original instructions. If a future adapter cannot represent instructions separately, it must throw `ByokProviderError` only when `instructions` is supplied; prompt-only calls remain unchanged.

Instruction and prompt strings are passed without trimming or rewriting. They are ordinary caller-provided model content, not credentials; host applications should handle them according to their normal content privacy and retention policies.

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
