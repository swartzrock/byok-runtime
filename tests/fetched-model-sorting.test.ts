import { describe, expect, it } from "vitest";
import { sortFetchedModelIds } from "../src/models/fetched-model-sorting";

describe("sortFetchedModelIds", () => {
	it("sorts fetched model IDs in a natural, readable order", () => {
		expect(
			sortFetchedModelIds([
				"whisper-1",
				"gpt-4o-2024-11-20",
				"gpt-4o-mini",
				"gpt-4o",
				"gpt-3.5-turbo",
				"gpt-3.5-turbo-16k",
				"gpt-4",
				"text-embedding-3-large",
				"text-embedding-3-small",
			])
		).toEqual([
			"gpt-3.5-turbo",
			"gpt-3.5-turbo-16k",
			"gpt-4",
			"gpt-4o",
			"gpt-4o-2024-11-20",
			"gpt-4o-mini",
			"text-embedding-3-large",
			"text-embedding-3-small",
			"whisper-1",
		]);
	});

	it("sorts OpenRouter provider/model IDs by provider then model", () => {
		expect(
			sortFetchedModelIds([
				"openai/gpt-4o",
				"anthropic/claude-sonnet-4",
				"google/gemini-1.5-pro",
				"anthropic/claude-haiku-4",
				"openai/gpt-4o-mini",
				"google/gemini-1.5-flash",
				"meta-llama/llama-3-70b",
			])
		).toEqual([
			"anthropic/claude-haiku-4",
			"anthropic/claude-sonnet-4",
			"google/gemini-1.5-flash",
			"google/gemini-1.5-pro",
			"meta-llama/llama-3-70b",
			"openai/gpt-4o",
			"openai/gpt-4o-mini",
		]);
	});

	it("sorts latest and dated variants alphanumerically", () => {
		expect(
			sortFetchedModelIds([
				"omni-moderation-2024-09-26",
				"omni-moderation-latest",
				"o3-mini-2025-01-31",
				"o3-mini",
			])
		).toEqual([
			"o3-mini",
			"o3-mini-2025-01-31",
			"omni-moderation-2024-09-26",
			"omni-moderation-latest",
		]);
	});
});
