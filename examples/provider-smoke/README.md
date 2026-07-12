# Provider Smoke CLI

Run real provider smoke checks from the repository root with BYOK's public facade.
Cloud providers use BYOK's env-backed credential mode with the standard provider environment variables.
Ollama and LM Studio use their default local server URLs. Codex and Claude use their installed, authenticated CLI commands.

| Provider   | Env-backed API key names             |
| ---------- | ------------------------------------ |
| Anthropic  | `ANTHROPIC_API_KEY`                  |
| OpenAI     | `OPENAI_API_KEY`                     |
| Google     | `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| xAI        | `XAI_API_KEY`                        |
| OpenRouter | `OPENROUTER_API_KEY`                 |
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

To detect providers in priority order, choose a random available model, and print one generated response:

```bash
./examples/first-available-llm.sh "What is BYOK?"
```

The fallback order is Ollama, LM Studio, Codex CLI, Claude CLI, then API keys for Anthropic, OpenAI, Google, xAI, and OpenRouter.
