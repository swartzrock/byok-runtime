# BYOK Runtime

[![npm](https://img.shields.io/npm/v/%40swartzrock%2Fbyok-runtime)](https://www.npmjs.com/package/@swartzrock/byok-runtime)
[![CI](https://github.com/swartzrock/byok-runtime/actions/workflows/ci.yml/badge.svg)](https://github.com/swartzrock/byok-runtime/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Build BYOK AI apps with one TypeScript API for user-owned cloud keys, local models, model discovery, and CLI providers.

**ESM-only · Node.js 20+ · trusted host runtimes only**

## Install

```sh
npm install @swartzrock/byok-runtime
```

If your application creates Zod schemas directly, install `zod` as an application dependency too:

```sh
npm install zod
```

## Quick Start

```ts
import { ByokProvider, generateText } from "@swartzrock/byok-runtime";

const { text } = await generateText({
	provider: ByokProvider.OpenAI,
	apiKey: process.env.OPENAI_API_KEY!,
	model: "gpt-4o-mini",
	instructions: "Answer for a technical audience. Be concise.",
	prompt: "Explain retrieval-augmented generation in two sentences.",
});

console.log(text);
```

Change the provider, credential, and model to run the same call against Anthropic, Google Gemini, xAI, OpenRouter, Groq, Mistral, DeepSeek, DeepInfra, Ollama, or LM Studio.

BYOK Runtime is designed for trusted servers, desktop backends, Electron main processes, and local tools. Browser and Electron renderer UIs should call it through a trusted host boundary rather than receive provider credentials directly.

## Why BYOK Runtime?

- One generation API across cloud keys, local model servers, and authenticated CLI tools.
- Lazy text streaming with explicit native or buffered delivery metadata.
- Model discovery through a provider-neutral runtime API.
- Connection testing with user-readable provider errors and rate-limit handling.
- Reusable clients that bind a credential or local provider URL while keeping the model per call.
- Optional structured output and custom transports through the lower-level provider runtime.
- No built-in credential persistence: the host application owns storage, encryption, and runtime policy.

## Provider Support

| Provider   | Credentials         | Model listing          | Generation           |
| ---------- | ------------------- | ---------------------- | -------------------- |
| Anthropic  | API key or env      | Account models         | Text and object      |
| OpenAI     | API key or env      | Model IDs              | Text and object      |
| Google     | API key or env      | Gemini model IDs       | Text and object      |
| xAI        | API key or env      | Model IDs              | Text and object      |
| OpenRouter | API key or env      | Portable model options | Text and JSON-like   |
| Groq       | API key or env      | Model IDs              | Text and JSON-like   |
| Mistral    | API key or env      | Model IDs              | Text and JSON-like   |
| DeepSeek   | API key or env      | Model IDs              | Text and JSON-like   |
| DeepInfra  | API key or env      | Model IDs              | Text and JSON-like   |
| Ollama     | Local or remote URL | Installed models       | Text                 |
| LM Studio  | Local or remote URL | Local model IDs        | Text and JSON-like   |
| Codex CLI  | Local CLI session   | Codex model IDs        | Text                 |
| Claude CLI | Local CLI session   | Anthropic model IDs    | Text with JSON hints |

Cloud and local-server providers use the main entrypoint. CLI providers can spawn local commands and are available only from `@swartzrock/byok-runtime/node`.

Groq, Mistral, DeepSeek, and DeepInfra reuse BYOK Runtime's OpenAI-compatible chat-completions and model-listing subset. This does not imply compatibility with every OpenAI API or provider-specific feature.

Optional `instructions` stay separate from the required user `prompt`:

| Providers                                                                                 | Instruction channel                               |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Anthropic, OpenAI, Google, xAI, OpenRouter, Groq, Mistral, DeepSeek, DeepInfra, LM Studio | OpenAI-compatible `system` message                |
| Ollama                                                                                    | Native `system` request field                     |
| Claude CLI                                                                                | `--append-system-prompt` (keeps Claude's default) |
| Codex CLI                                                                                 | Per-run `developer_instructions` config           |

All built-in text providers support this separation, and providers exposing `generateObject` use the same native instruction channel. BYOK Runtime never concatenates `instructions` into `prompt`. An adapter without a separate native channel must reject only calls that supply `instructions` with `ByokProviderError`; prompt-only calls remain unchanged.

## Common Workflows

### Reuse a Credential

Use `createByok` when several calls share the same provider credential or local URL. The model remains selectable per call.

```ts
import { ByokProvider, createByok } from "@swartzrock/byok-runtime";

const ai = createByok({
	provider: ByokProvider.OpenAI,
	apiKey: process.env.OPENAI_API_KEY!,
});

const { text } = await ai.generateText({
	model: "gpt-4o-mini",
	instructions: "Use release-note style and active voice.",
	prompt: "Draft a short release note for a model-provider SDK.",
});
```

### Stream Text

Use `streamText` when the caller can render incremental output. Creating the stream is lazy: the
provider request starts when iteration begins, not when `streamText` returns.

```ts
import { ByokProvider, streamText } from "@swartzrock/byok-runtime";

const { delivery, textStream } = streamText({
	provider: ByokProvider.OpenAI,
	apiKey: process.env.OPENAI_API_KEY!,
	model: "gpt-4o-mini",
	prompt: "Explain BYOK in one paragraph.",
});

let text = "";
for await (const delta of textStream) {
	text += delta;
}

console.log(delivery, text);
```

`delivery` is `"native"` for verified OpenAI-compatible routes and Ollama's fetch-backed
transport. It is `"buffered"` when an adapter completes generation first and emits the exact text
as one delta, including Codex CLI, Claude CLI, and unsupported custom transports. Concatenating all
deltas reconstructs the generated text exactly.

The stream accepts the same optional `signal` as `generateText`. Aborting that signal, returning
the iterator, or breaking from `for await` aborts the underlying request or local process. Streams
are single-consumer. Rate-limit retries may occur before the first text delta; after a delta is
emitted, BYOK never restarts the request and risk duplicating text. Existing `generateText`
behavior is unchanged.

### Discover Models

Use `listModels` during provider setup before a user has selected a model.

```ts
import { ByokProvider, listModels } from "@swartzrock/byok-runtime";

const models = await listModels({
	provider: ByokProvider.OpenAI,
	apiKey: process.env.OPENAI_API_KEY!,
});

// [{ id: "gpt-4o-mini", label: "gpt-4o-mini" }, ...]
```

Model discovery returns portable `ByokModelOption` values with `id` and `label`. Provider-specific pricing, context length, and recommendation metadata belong in provider-specific APIs or the host application.

### Test a Connection

Use the Node runtime when an application needs connection testing, structured output, JSON response hints, CLI providers, or custom transports.

Discover locally available provider candidates before asking a user to choose one:

```ts
import { findAvailableProviders } from "@swartzrock/byok-runtime/node";

const providers = await findAvailableProviders({ env: process.env });
```

The ordered result checks local servers, installed AI CLIs, then standard cloud API-key variables. Discovery is lightweight; list models or test the selected provider before generation.

```ts
import { ByokProvider, createByokNodeProvider } from "@swartzrock/byok-runtime/node";

const provider = createByokNodeProvider({
	provider: ByokProvider.OpenAI,
	apiKey: process.env.OPENAI_API_KEY!,
	model: "gpt-4o-mini",
});

const status = await provider.testConnection();

if (!status.ok) {
	throw new Error(status.message);
}
```

When supported, `status.models` contains model IDs returned during the connection test.

Custom transports use one normalized request contract across every HTTP-backed provider:

```ts
import type { ByokTransport } from "@swartzrock/byok-runtime";

const transport = Object.assign(
	async (request: Request) => {
		// Bridge the normalized Request to the trusted host's HTTP API.
		return fetch(request);
	},
	{ supportsStreaming: true }
) satisfies ByokTransport;
```

Pass it as `{ transport }` in client or provider dependencies. Declare `supportsStreaming: true` only when the host returns progressive response bodies; otherwise BYOK reports streamed output as buffered delivery.

### Generate Structured Objects

Provider runtimes that expose `generateObject` accept a Zod schema and optional provider-native instructions. Ollama and local CLI providers are text-only.

```ts
import { z } from "zod/v3";

const schema = z.object({
	title: z.string(),
	risks: z.array(z.string()),
});

if (!provider.generateObject) {
	throw new Error(`${provider.label} does not support structured objects.`);
}

const report = await provider.generateObject({
	instructions: "Remain faithful to the supplied source material.",
	prompt: "Return the main risks of storing API keys in plaintext.",
	schema,
});
```

`ByokObjectGenerationInput<T>.instructions` has the same separation and whitespace-preserving semantics as text generation. It is never folded into the user prompt, and structured-output repair attempts retain the original instructions.

### Use Local Models

Ollama defaults to `http://localhost:11434`:

```ts
import { ByokProvider, generateText } from "@swartzrock/byok-runtime";

const { text } = await generateText({
	provider: ByokProvider.Ollama,
	model: "llama3.1:8b",
	prompt: "Write one sentence about local model inference.",
});
```

LM Studio defaults to `http://localhost:1234/v1`. Both providers accept an explicit `http:` or `https:` URL when the server is listening elsewhere.

### Use Local CLI Providers

CLI providers run authenticated local commands and must be imported from the Node subpath.

```ts
import { ByokProvider, createByokNodeProvider } from "@swartzrock/byok-runtime/node";

const provider = createByokNodeProvider({
	provider: ByokProvider.ClaudeCli,
	command: "claude",
	model: "sonnet",
});

const { text } = await provider.generateText({
	instructions: "Write for an on-call engineer. Preserve error codes exactly.",
	prompt: "Summarize this backend job failure in one paragraph.",
});
```

Only expose CLI providers in environments where users expect local process execution.

## Credentials and Security

Explicit `apiKey` values are recommended for host applications because the host remains responsible for credential collection and storage. Trusted scripts can opt into environment-backed credentials:

```ts
import { ByokProvider, generateText } from "@swartzrock/byok-runtime";

const { text } = await generateText({
	provider: ByokProvider.OpenAI,
	credential: { source: "env", env: process.env },
	model: "gpt-4o-mini",
	prompt: "Explain env-backed credentials in one sentence.",
});
```

Supported names are `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `DEEPSEEK_API_KEY`, and `DEEPINFRA_TOKEN`. Google checks `GOOGLE_API_KEY` before `GEMINI_API_KEY`.

Callers can inspect the flat `BYOK_API_KEY_ENV_VARS` list or the provider-keyed `BYOK_PROVIDER_API_KEY_ENV_VARS` map through the main package entrypoint.

BYOK Runtime does not read `process.env` on its own, parse `.env` files, persist credentials, or log credential values. `instructions` and `prompt` are ordinary caller-provided model content, not credentials; hosts should apply their normal content-handling and privacy policies to both. See the [security policy](https://github.com/swartzrock/byok-runtime/blob/main/SECURITY.md) for reporting instructions.

Hosts should pass the current persisted BYOK subtree through `parseByokStoredSettings(unknown)` before use. The parser supplies safe defaults and filters malformed provider settings, model collections, and verification snapshots. Storage, encryption, and host-specific legacy migrations remain host responsibilities.

## Entry Points

- `@swartzrock/byok-runtime` — API-key providers, Ollama, LM Studio, helpers, metadata, and shared types.
- `@swartzrock/byok-runtime/node` — everything above plus provider discovery, local CLI providers, and command execution.

Import from these public entrypoints only. Files under `src/providers` and `src/models` are package internals.

## Documentation and Examples

- [API reference](./API.md)
- [Provider smoke CLI](https://github.com/swartzrock/byok-runtime/tree/main/examples/provider-smoke)
- [First available LLM script](./examples/first-available-llm.sh)
- [Contributing guide](https://github.com/swartzrock/byok-runtime/blob/main/CONTRIBUTING.md)
- [Changelog](./CHANGELOG.md)

## License

MIT. See [LICENSE](./LICENSE).
