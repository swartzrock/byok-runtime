#!/usr/bin/env bash

set -euo pipefail

random_model() {
	awk 'BEGIN { srand() } NF && rand() < 1 / ++count { model = $0 } END { print model }'
}

if [[ $# -eq 0 ]]; then
	printf 'Usage: %s <question>\n' "$(basename "$0")" >&2
	exit 2
fi

# This repo uses bun to build and run scripts
if ! command -v bun >/dev/null 2>&1; then
	printf 'Bun is required to run the BYOK Runtime example.\n' >&2
	exit 127
fi

question="$*"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
providers=()

# First check for local VM APIs
if command -v curl >/dev/null 2>&1; then
	if curl -fsS --max-time 1 "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
		providers+=("ollama")
	fi
	if curl -fsS --max-time 1 "http://127.0.0.1:1234/v1/models" >/dev/null 2>&1; then
		providers+=("lm-studio")
	fi
fi

# Then check for installed AI CLIs
if command -v codex >/dev/null 2>&1; then
	providers+=("codex-cli")
fi
if command -v claude >/dev/null 2>&1; then
	providers+=("claude-cli")
fi

# Then check for defined API keys
[[ -n "${ANTHROPIC_API_KEY:-}" ]] && providers+=("anthropic")
[[ -n "${OPENAI_API_KEY:-}" ]] && providers+=("openai")
[[ -n "${GOOGLE_API_KEY:-}${GEMINI_API_KEY:-}" ]] && providers+=("google")
[[ -n "${XAI_API_KEY:-}" ]] && providers+=("xai")
[[ -n "${OPENROUTER_API_KEY:-}" ]] && providers+=("openrouter")

if [[ ${#providers[@]} -eq 0 ]]; then
	printf 'No available LLM provider found.\n' >&2
	exit 1
fi

byok=(bun run "$script_dir/provider-smoke/src/cli.ts")

# Iterate over providers, choosing a random model and generating text until success
for provider in "${providers[@]}"; do
	if ! models_output="$("${byok[@]}" models --provider "$provider" 2>/dev/null)"; then
		continue
	fi
	model="$(printf '%s\n' "$models_output" | random_model)"
	if [[ -z "$model" ]]; then
		continue
	fi

	if response="$("${byok[@]}" generate --provider "$provider" --model "$model" --input "$question" 2>/dev/null)" &&
		[[ -n "$response" ]]; then
		printf '%s\n' "$response"
		exit 0
	fi
done

printf 'No detected LLM provider could list models and generate a response.\n' >&2
exit 1
