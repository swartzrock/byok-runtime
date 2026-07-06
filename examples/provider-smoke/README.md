# Provider Smoke CLI

Run real provider smoke checks from the repository root with BYOK's public facade.
Cloud providers use `--api-key` when supplied; otherwise they use BYOK's env-backed credential mode with the standard provider environment variables.
Ollama stays URL-backed and defaults to the local server URL.

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
```
