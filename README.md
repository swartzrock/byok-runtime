# BYOK Runtime

[![npm](https://img.shields.io/npm/v/%40swartzrock%2Fbyok-runtime)](https://www.npmjs.com/package/@swartzrock/byok-runtime)
[![CI](https://github.com/swartzrock/byok-runtime/actions/workflows/ci.yml/badge.svg)](https://github.com/swartzrock/byok-runtime/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Build BYOK AI apps with one TypeScript API for user-owned cloud keys, local models, model discovery, and CLI providers.

**ESM-only · Node.js 20+ · trusted host runtimes only**

Contributing? See [CONTRIBUTING.md](./CONTRIBUTING.md) to build, test, and submit changes.

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

Change the provider, credential, and model to run the same call against Anthropic, Google Gemini, xAI, OpenRouter, Groq, Mistral, DeepSeek, DeepInfra, Together AI, Fireworks AI, Ollama, or LM Studio.

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

| Provider     | Credentials         | Model listing          | Generation           |
| ------------ | ------------------- | ---------------------- | -------------------- |
| Anthropic    | API key or env      | Account models         | Text and object      |
| OpenAI       | API key or env      | Model IDs              | Text and object      |
| Google       | API key or env      | Gemini model IDs       | Text and object      |
| xAI          | API key or env      | Model IDs              | Text and object      |
| OpenRouter   | API key or env      | Portable model options | Text and JSON-like   |
| Groq         | API key or env      | Model IDs              | Text and JSON-like   |
| Mistral      | API key or env      | Model IDs              | Text and JSON-like   |
| DeepSeek     | API key or env      | Model IDs              | Text and JSON-like   |
| DeepInfra    | API key or env      | Model IDs              | Text and JSON-like   |
| Together AI  | API key or env      | Model IDs              | Text and JSON-like   |
| Fireworks AI | API key or env      | Model IDs              | Text and JSON-like   |
| Ollama       | Local or remote URL | Installed models       | Text                 |
| LM Studio    | Local or remote URL | Local model IDs        | Text and JSON-like   |
| Codex CLI    | Local CLI session   | Codex model IDs        | Text                 |
| Claude CLI   | Local CLI session   | Anthropic model IDs    | Text with JSON hints |

Cloud and local-server providers use the main entrypoint. CLI providers can spawn local commands and are available only from `@swartzrock/byok-runtime/node`.

Groq, Mistral, DeepSeek, DeepInfra, Together AI, and Fireworks AI reuse BYOK Runtime's OpenAI-compatible chat-completions and model-listing subset. This does not imply compatibility with every OpenAI API or provider-specific feature.

Optional `instructions` stay separate from the required user `prompt` and are never concatenated into it. Each provider maps `instructions` to its own native channel — see [Instruction Channels](./API.md#instruction-channels) in the API reference.

## Common Workflows

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

For reusable credentials, model discovery, connection testing, structured objects, local model servers, and local CLI providers, see the [API reference](./API.md).

## Credentials and Security

Host applications own credential collection and storage; BYOK Runtime does not read `process.env` on its own, parse `.env` files, persist credentials, or log credential values. Explicit `apiKey` values are recommended — trusted scripts can opt into environment-backed credentials instead (see [env-backed credentials](./API.md#env-backed-credentials) for supported variable names).

`instructions` and `prompt` are ordinary caller-provided model content, not credentials; hosts should apply their normal content-handling and privacy policies to both. See the [security policy](https://github.com/swartzrock/byok-runtime/blob/main/SECURITY.md) for reporting instructions.

Hosts should pass the current persisted BYOK subtree through `parseByokStoredSettings(unknown)` before use — see [Storage And Setup State](./API.md#storage-and-setup-state).

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
