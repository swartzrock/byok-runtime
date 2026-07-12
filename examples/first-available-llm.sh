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
byok=(bun run "$script_dir/provider-smoke/src/cli.ts")
providers=()

if ! providers_output="$("${byok[@]}" detect 2>/dev/null)"; then
	printf 'LLM provider discovery failed.\n' >&2
	exit 1
fi
while IFS= read -r provider; do
	[[ -n "$provider" ]] && providers+=("$provider")
done <<< "$providers_output"

if [[ ${#providers[@]} -eq 0 ]]; then
	printf 'No available LLM provider found.\n' >&2
	exit 1
fi

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
