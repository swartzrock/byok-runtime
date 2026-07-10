# BYOK-Runtime

[![npm](https://img.shields.io/npm/v/%40swartzrock%2Fbyok-runtime)](https://www.npmjs.com/package/@swartzrock/byok-runtime)
[![CI](https://github.com/swartzrock/byok-runtime/actions/workflows/ci.yml/badge.svg)](https://github.com/swartzrock/byok-runtime/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Run your TypeScript app against user-supplied AI accounts — without writing provider-specific generation code.

```ts
import { ByokProvider, generateText } from "@swartzrock/byok-runtime";

const { text } = await generateText({
	provider: ByokProvider.OpenAI,
	apiKey: process.env.OPENAI_API_KEY!,
	model: "gpt-4o-mini",
	prompt: "Explain retrieval-augmented generation in two sentences.",
});
```

Swap the `ByokProvider` and the same call runs against Anthropic, Google Gemini, xAI, OpenRouter, or a local Ollama or LM Studio server. For setup flows, call `listModels` before a model is selected. When an app needs connection testing, structured output, or custom runtime methods, BYOK also exposes the lower-level provider runtime.

The API is shaped for backend, desktop backend, Electron main-process, and other trusted TypeScript runtimes.

## Features

- Unified runtime for Anthropic, OpenAI, Google Gemini, xAI, OpenRouter, Ollama, LM Studio, Codex CLI, and Claude CLI.
- One-call `generateText` helper for core providers with default fetch-based transports.
- `createByok` client for repeated text generation with one bound credential or local provider URL.
- Opt-in env-backed credentials for trusted local scripts and smoke tooling.
- Trusted-runtime main entrypoint for API-key providers, Ollama, and LM Studio.
- Node-only subpath for local CLI providers and command execution.
- App-supplied `fetch` and HTTP transports so callers can run in trusted Node, desktop backend, test, or custom runtimes.
- Provider metadata for settings UIs: labels, credential fields, model fields, icons, setup requirements, and model-list capability flags.
- Connection testing with user-readable provider errors and rate-limit retry handling for AI SDK providers.
- Model discovery helpers, portable model options, and Anthropic model-selection helpers.
- Plain text generation for every provider runtime.
- Optional structured-object generation for AI SDK providers that expose `generateObject`.
- Setup-state helpers for determining whether credentials, model selection, and verification snapshots are current.

## Provider Support

| Provider ID  | Credential                        | Entry point                     | Model listing                                                    | Generation                                          |
| ------------ | --------------------------------- | ------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| `anthropic`  | API key or env credential + model | `@swartzrock/byok-runtime`      | Anthropic account models                                         | Text and object                                     |
| `openai`     | API key or env credential + model | `@swartzrock/byok-runtime`      | OpenAI model IDs                                                 | Text and object                                     |
| `google`     | API key or env credential + model | `@swartzrock/byok-runtime`      | Gemini model IDs                                                 | Text and object                                     |
| `xai`        | API key or env credential + model | `@swartzrock/byok-runtime`      | xAI model IDs                                                    | Text and object                                     |
| `openrouter` | API key or env credential + model | `@swartzrock/byok-runtime`      | Portable model options                                           | Text and object-like JSON parsing                   |
| `ollama`     | URL + model                       | `@swartzrock/byok-runtime`      | Installed local models                                           | Text                                                |
| `lm-studio`  | URL + model                       | `@swartzrock/byok-runtime`      | Local OpenAI-compatible model IDs                                | Text and object-like JSON parsing                   |
| `codex-cli`  | Local command, optional model     | `@swartzrock/byok-runtime/node` | Codex CLI model IDs                                              | Text                                                |
| `claude-cli` | Local command, optional model     | `@swartzrock/byok-runtime/node` | Anthropic model IDs from OpenRouter, without the provider prefix | Text, with JSON-schema hints through `generateText` |

The main entrypoint avoids Node-only process APIs, but it is still intended for trusted host runtimes that can safely receive provider credentials. Use `@swartzrock/byok-runtime/node` only from trusted Node or desktop backends that are allowed to spawn local commands.

## Installation

```sh
npm install @swartzrock/byok-runtime
```

If your application builds schemas directly, install `zod` as an application dependency too:

```sh
npm install zod
```

Runtime requirement: Node.js 20 or newer for backend usage. Browser and Electron renderer UIs should call BYOK through a trusted server, main process, local backend, or custom transport rather than importing BYOK directly with provider credentials.

## Entry Points

Use the main entrypoint for trusted-runtime API-key providers, Ollama, LM Studio, and shared types:

```ts
import {
	createByok,
	generateText,
	listModels,
	type ByokProviderDeps,
} from "@swartzrock/byok-runtime";
```

Use the Node-only subpath for local CLI providers:

```ts
import {
	createByokNodeProvider,
	type ByokProviderConfig,
	type ByokProviderDeps,
} from "@swartzrock/byok-runtime/node";
```

Provider implementation files under `src/providers` and helper files under `src/models` are package internals. Consumers should import from the public entrypoints only.

## Security

BYOK receives credentials only as call inputs. It does not persist or log API keys. Keep BYOK execution behind a trusted server, main process, local backend, or custom transport; browser and Electron renderer UIs should not import BYOK directly with provider credentials.

### Env-Backed Credentials

Explicit `apiKey` values are the recommended path for host apps because the host stays in charge of credential collection and storage. For trusted local scripts and examples, cloud providers can instead opt in to BYOK's standard environment variable map:

```ts
import { ByokProvider, generateText } from "@swartzrock/byok-runtime";

const { text } = await generateText({
	provider: ByokProvider.OpenAI,
	credential: { source: "env", env: process.env },
	model: "gpt-4o-mini",
	prompt: "Explain env-backed BYOK credentials in one sentence.",
});
```

Supported names are `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, and `OPENROUTER_API_KEY`. Google checks `GOOGLE_API_KEY` before `GEMINI_API_KEY`. BYOK does not parse `.env` files, read `process.env` on its own, persist secrets, log values, or add env credentials for local URL-backed providers.

## Basic Usage

### Reuse a Credential

Use `createByok` when several calls share the same provider credential or local provider URL. The model stays per call.

```ts
import { ByokProvider, createByok } from "@swartzrock/byok-runtime";

const ai = createByok({
	provider: ByokProvider.OpenAI,
	apiKey: process.env.OPENAI_API_KEY!,
});

const { text } = await ai.generateText({
	model: "gpt-4o-mini",
	prompt: "Draft a short release note for a model-provider SDK.",
});
```

`createByok` is intentionally narrow: it binds the credential or URL, then accepts a model and prompt per call. Use `listModels` for setup-time model discovery.

Trusted scripts can bind env-backed credentials the same way:

```ts
const ai = createByok({
	provider: ByokProvider.OpenAI,
	credential: { source: "env", env: process.env },
});
```

### List Providers

Use the registry helpers to drive configuration screens or backend allowlists.

```ts
import { byokProviderDefinitions } from "@swartzrock/byok-runtime";

for (const provider of byokProviderDefinitions()) {
	console.log(provider.id, provider.label, provider.supportsModelListing);
}
```

### Advanced: Create a Node Runtime

Create a runtime when your app is testing credentials, using structured output, or supplying custom transports.

```ts
import { ByokProvider, createByokNodeProvider } from "@swartzrock/byok-runtime/node";

const provider = createByokNodeProvider({
	provider: ByokProvider.OpenAI,
	apiKey,
	model: "gpt-4o-mini",
});
```

Pass custom deps when your host app owns transport behavior:

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

### Test Connection

Every runtime exposes `testConnection()`.

```ts
const status = await provider.testConnection();

if (!status.ok) {
	console.error(status.message);
} else {
	console.log(status.message);
}
```

For providers with model-list support, `status.models` may include model IDs returned during the connection test.

### Fetch Models

Use the top-level `listModels` helper for setup-time model discovery. It does not require a selected model.

```ts
const models = await listModels({
	provider: ByokProvider.OpenAI,
	apiKey: process.env.OPENAI_API_KEY!,
});
```

Model discovery returns portable `ByokModelOption` values with `id` and `label`. Provider-specific metadata such as pricing, context length, supported parameters, or recommendation badges belongs in provider-specific APIs or the host app.

### Generate Text with a Runtime

```ts
const result = await provider.generateText(
	{
		prompt: "Draft a short release note for a model-provider SDK.",
	},
	abortController.signal
);

console.log(result.text);
```

Text providers may accept JSON-oriented hints:

```ts
const result = await provider.generateText({
	prompt: "Return a JSON object with an `ok` boolean.",
	responseFormat: "json",
	jsonSchema: JSON.stringify({
		type: "object",
		properties: { ok: { type: "boolean" } },
		required: ["ok"],
	}),
});
```

These hints are provider dependent. Host apps should still validate and repair model output.

### Generate Structured Objects

AI SDK based providers expose `generateObject`. Check for the method before calling it because Ollama and local CLI providers are text-only.

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
	prompt: "Return the main risks of storing API keys in plaintext.",
	schema,
});
```

## Model Discovery

Providers with model-list support return portable model options:

```ts
const models = await listModels({
	provider: ByokProvider.OpenAI,
	apiKey: process.env.OPENAI_API_KEY!,
});
// [{ id: "gpt-4o-mini", label: "gpt-4o-mini" }]
```

`ByokModelOption` intentionally contains only `id` and `label`. Provider-specific metadata such as pricing, context length, supported parameters, or recommendation badges belongs in provider-specific APIs or the host app.

### List Models

Use `listModels` when you need setup-time model discovery. Model discovery does not require a selected model:

```ts
import { ByokProvider, listModels } from "@swartzrock/byok-runtime";

const models = await listModels({
	provider: ByokProvider.OpenAI,
	apiKey: process.env.OPENAI_API_KEY!,
});
```

`ByokProvider.Anthropic`, `ByokProvider.OpenAI`, `ByokProvider.Google`, `ByokProvider.Xai`, and `ByokProvider.OpenRouter` use the same API-key shape. `ByokProvider.Ollama` defaults to `http://localhost:11434`; `ByokProvider.LmStudio` defaults to `http://localhost:1234/v1` and accepts root URLs like `http://localhost:1234`.

Trusted scripts can also list cloud models with env-backed credentials:

```ts
const models = await listModels({
	provider: ByokProvider.Google,
	credential: { source: "env", env: process.env },
});
```

CLI model discovery is available from the `@swartzrock/byok-runtime/node` runtime provider. Codex CLI uses `codex debug models`; Claude CLI fetches Anthropic model IDs from OpenRouter's public model list and strips the OpenRouter provider prefix.

## Provider Smoke CLI

This repository includes an example smoke CLI for manual provider checks. It delegates credential lookup to BYOK: pass `--api-key` for explicit credentials, omit it for env-backed cloud credentials, and use `--url` only for local URL-backed providers.

```bash
OPENAI_API_KEY="<OPENAI_API_KEY>" bun run provider-smoke generate \
	--provider openai \
	--model gpt-4o-mini \
	--input "Reply with one short sentence."

bun run provider-smoke models \
	--provider anthropic \
	--api-key "<ANTHROPIC_API_KEY>"

GOOGLE_API_KEY="<GOOGLE_API_KEY>" GEMINI_API_KEY="<GEMINI_API_KEY>" \
	bun run provider-smoke models --provider google

bun run provider-smoke generate \
	--provider ollama \
	--model llama3.1:8b \
	--input "Write one sentence about local inference."

bun run provider-smoke models \
	--provider ollama \
	--url http://127.0.0.1:11434

bun run provider-smoke models \
	--provider lm-studio \
	--url http://127.0.0.1:1234/v1
```

### Use Ollama

Ollama defaults to `http://localhost:11434` instead of using a raw API key.

```ts
import { ByokProvider, generateText } from "@swartzrock/byok-runtime";

const response = await generateText({
	provider: ByokProvider.Ollama,
	model: "llama3.1:8b",
	prompt: "Write one sentence about local model inference.",
});
```

Pass `url` only when using a non-default local, LAN, or remote Ollama server. BYOK accepts explicit `http:` and `https:` Ollama URLs without embedded credentials; prompts are sent to the configured URL.

### Use LM Studio

LM Studio defaults to `http://localhost:1234/v1` and uses the existing OpenAI-compatible runtime.

```ts
import { ByokProvider, generateText } from "@swartzrock/byok-runtime";

const response = await generateText({
	provider: ByokProvider.LmStudio,
	model: "qwen2.5-7b-instruct",
	prompt: "Write one sentence about local model inference.",
});
```

Pass `url` only when LM Studio is listening somewhere other than the default local REST API. Root URLs such as `http://localhost:1234` are normalized to the `/v1` API base.

### Use Local CLI Providers

Local CLI providers are available only from the Node subpath.

```ts
import { ByokProvider, createByokNodeProvider } from "@swartzrock/byok-runtime/node";

const provider = createByokNodeProvider(
	{
		provider: ByokProvider.ClaudeCli,
		command: "claude",
		model: "sonnet",
	},
	deps
);

const status = await provider.testConnection();
if (!status.ok) throw new Error(status.message);

const { text } = await provider.generateText({
	prompt: "Summarize this backend job failure in one paragraph.",
});
```

CLI providers execute local commands. Only expose them in environments where users expect local process execution.

BYOK does not persist credentials, fetched models, or setup verification state. Host apps own the actual storage schema, encryption, migration flow, and UI-specific model sorting.

## API Reference

See [API.md](./API.md) for the full public API reference, including exported functions, constants, classes, entrypoint differences, and public types.

## Development

From the repository root:

```sh
bun install
bun run format:check
bun run lint
bun run build
bun run typecheck
bun run typecheck:examples
bun run test
bun run pack:check
bun run publint
bun run attw
```

## Package Boundaries

Host apps own storage, UI, secret handling, prompting, validation, and app-specific workflows. BYOK receives resolved runtime credentials through provider configs and must not import host app settings, UI helpers, or prompt/validation modules.

## License

MIT. See [LICENSE](./LICENSE).
