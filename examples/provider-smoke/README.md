# Provider Smoke CLI

Run real provider smoke checks from the repository root with BYOK's public facade.
Cloud providers use BYOK's env-backed credential mode with the standard provider environment variables.
Ollama and LM Studio use their default local server URLs. Codex and Claude use their installed, authenticated CLI commands.

```bash
bun run provider-smoke detect
```

`detect` delegates to the Node runtime's `findAvailableProviders` function and prints provider IDs in fallback order.

| Provider   | Env-backed API key names             |
| ---------- | ------------------------------------ |
| Anthropic  | `ANTHROPIC_API_KEY`                  |
| OpenAI     | `OPENAI_API_KEY`                     |
| Google     | `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| xAI        | `XAI_API_KEY`                        |
| OpenRouter | `OPENROUTER_API_KEY`                 |
| Groq       | `GROQ_API_KEY`                       |
| Mistral    | `MISTRAL_API_KEY`                    |
| DeepSeek   | `DEEPSEEK_API_KEY`                   |
| DeepInfra  | `DEEPINFRA_TOKEN`                    |
| Ollama     | n/a                                  |
| LM Studio  | n/a                                  |
| Codex CLI  | n/a                                  |
| Claude CLI | n/a                                  |

```bash
OPENAI_API_KEY="<OPENAI_API_KEY>" bun run provider-smoke generate \
	--provider openai \
	--model gpt-4o-mini \
	--input "Reply with one short sentence."

ANTHROPIC_API_KEY="<ANTHROPIC_API_KEY>" \
	bun run provider-smoke models --provider anthropic

GOOGLE_API_KEY="<GOOGLE_API_KEY>" GEMINI_API_KEY="<GEMINI_API_KEY>" \
	bun run provider-smoke models --provider google

GROQ_API_KEY="<GROQ_API_KEY>" \
	bun run provider-smoke models --provider groq

bun run provider-smoke generate \
	--provider ollama \
	--model llama3.1:8b \
	--input "Write one sentence about local inference."

bun run provider-smoke models --provider codex-cli

bun run provider-smoke generate \
	--provider claude-cli \
	--model sonnet \
	--input "Reply with one short sentence."
```

To detect providers through the library, choose a random available model, and print one generated response:

```bash
./examples/first-available-llm.sh "What is BYOK?"
```

The fallback order is Ollama, LM Studio, Codex CLI, Claude CLI, then API keys for Anthropic, OpenAI, Google, xAI, OpenRouter, Groq, Mistral, DeepSeek, and DeepInfra.

Groq, Mistral, DeepSeek, and DeepInfra smoke checks exercise BYOK's OpenAI-compatible chat-completions and model-listing subset, not full OpenAI API parity.
