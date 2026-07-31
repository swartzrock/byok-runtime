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

## Admit an OpenAI-compatible provider

Use this procedure only for a fixed-endpoint provider that is being added through the existing OpenAI-compatible runtime. Choose a current, public chat model ID before starting, and export the provider's standard credential environment variable without putting the credential in a repository file.

Set the provider ID and the exact model ID to admit:

```bash
PROVIDER="<provider-id>"
MODEL_ID="<public-chat-model-id>"
```

List models with OpenAI SDK logging disabled. The `awk` check prints only the returned count and whether an exact line matches `MODEL_ID`; it does not save the catalog:

```bash
OPENAI_LOG=off bun run provider-smoke models --provider "$PROVIDER" |
	awk -v target="$MODEL_ID" '
		{ count += 1 }
		$0 == target { found = 1 }
		END {
			printf "returned_model_count=%d\n", count
			printf "exact_model_present=%s\n", found ? "yes" : "no"
			exit found ? 0 : 1
		}
	'
```

Stop if the catalog is empty, the command fails, or `exact_model_present` is not `yes`. Do not run generation and do not create a receipt.

Only after the exact ID is present, generate with that same ID and a synthetic, low-cost prompt:

```bash
OPENAI_LOG=off bun run provider-smoke generate \
	--provider "$PROVIDER" \
	--model "$MODEL_ID" \
	--input "Reply with exactly: OK"
```

Stop without creating a receipt if the command fails or returns blank assistant text. Authentication errors, rate limits, network failures, and timeouts are all failed admissions.

After both commands pass, manually copy `docs/provider-admission/receipt-template.json` to `docs/provider-admission/receipts/<provider-id>.json` and replace its placeholders. Record the fixed base URL from the provider manifest, the package and installed OpenAI SDK versions, the UTC verification time, the exact model ID, the terminal-reported model count, and both pass results. The receipt is a maintainer-authored attestation, not generated command output.

Keep all live output in the terminal: do not redirect it, pipe it through `tee`, or paste it into repository files. Before committing, manually review the receipt and diff for credentials, headers, prompts, completions, full model catalogs, account IDs, raw command output, or raw response bodies. Commit the passing receipt in the same commit as that provider's runtime and documentation surfaces.

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
