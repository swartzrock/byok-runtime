#!/usr/bin/env bash

set -euo pipefail

if [[ $# -eq 0 ]]; then
	printf 'Usage: %s <question>\n' "$(basename "$0")" >&2
	exit 2
fi

question="$*"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ollama_url="${OLLAMA_URL:-http://127.0.0.1:11434}"
lm_studio_url="${LM_STUDIO_URL:-http://127.0.0.1:1234/v1}"
providers=()
urls=()
executables=()

add_candidate() {
	providers[${#providers[@]}]="$1"
	urls[${#urls[@]}]="${2:-}"
	executables[${#executables[@]}]="${3:-}"
}

if command -v curl >/dev/null 2>&1; then
	if curl -fsS --max-time 1 "${ollama_url%/}/api/tags" >/dev/null 2>&1; then
		add_candidate "ollama" "$ollama_url"
	fi
	if curl -fsS --max-time 1 "${lm_studio_url%/}/models" >/dev/null 2>&1; then
		add_candidate "lm-studio" "$lm_studio_url"
	fi
fi

if codex_command="$(command -v codex 2>/dev/null)"; then
	add_candidate "codex-cli" "" "$codex_command"
fi
if claude_command="$(command -v claude 2>/dev/null)"; then
	add_candidate "claude-cli" "" "$claude_command"
fi

[[ -n "${ANTHROPIC_API_KEY:-}" ]] && add_candidate "anthropic"
[[ -n "${OPENAI_API_KEY:-}" ]] && add_candidate "openai"
[[ -n "${GOOGLE_API_KEY:-}${GEMINI_API_KEY:-}" ]] && add_candidate "google"
[[ -n "${XAI_API_KEY:-}" ]] && add_candidate "xai"
[[ -n "${OPENROUTER_API_KEY:-}" ]] && add_candidate "openrouter"

if [[ ${#providers[@]} -eq 0 ]]; then
	printf 'No available LLM provider found.\n' >&2
	exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
	printf 'Bun is required to run the BYOK Runtime example.\n' >&2
	exit 127
fi

byok=(bun run "$script_dir/provider-smoke/src/cli.ts")

for index in "${!providers[@]}"; do
	provider="${providers[$index]}"
	url="${urls[$index]}"
	executable="${executables[$index]}"
	models_args=(models --provider "$provider")
	generate_args=(generate --provider "$provider")
	if [[ -n "$url" ]]; then
		models_args+=(--url "$url")
		generate_args+=(--url "$url")
	fi
	if [[ -n "$executable" ]]; then
		models_args+=(--executable "$executable")
		generate_args+=(--executable "$executable")
	fi

	if ! models_output="$("${byok[@]}" "${models_args[@]}" 2>/dev/null)"; then
		continue
	fi
	model="$(printf '%s\n' "$models_output" | awk '
		NF { models[++count] = $0 }
		END {
			if (count) {
				srand()
				print models[1 + int(rand() * count)]
			}
		}
	')"
	if [[ -z "$model" ]]; then
		continue
	fi

	if response="$("${byok[@]}" "${generate_args[@]}" --model "$model" --input "$question" 2>/dev/null)" &&
		[[ -n "$response" ]]; then
		printf '%s\n' "$response"
		exit 0
	fi
done

printf 'No detected LLM provider could list models and generate a response.\n' >&2
exit 1
