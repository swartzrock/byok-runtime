import { describe, expect, it } from "vitest";
import type { ModelInfo } from "@anthropic-ai/sdk/resources/models";
import {
	ANTHROPIC_CUSTOM_MODEL_ID,
	anthropicModelInfoToByokModelOption,
	buildAnthropicModelOptions,
	describeAnthropicModel,
	describeAnthropicModelDetails,
	formatAnthropicModelHint,
	formatAnthropicUnavailableModelMessage,
	isAnthropicCustomModelSelection,
	normalizeAnthropicModelSelection,
	refreshAnthropicModelOptions,
} from "../src/models/anthropic-models";

function modelInfo(id: string, display_name: string): ModelInfo {
	return {
		id,
		display_name,
		type: "model",
		created_at: "2026-01-01T00:00:00Z",
		max_input_tokens: null,
		max_tokens: null,
		capabilities: null,
	} as ModelInfo;
}

describe("isAnthropicCustomModelSelection", () => {
	it("treats unknown Anthropic model IDs as custom", () => {
		expect(
			isAnthropicCustomModelSelection({
				anthropicModel: "claude-unknown-xyz",
			})
		).toBe(true);
	});

	it("treats the explicit custom sentinel as custom", () => {
		expect(
			isAnthropicCustomModelSelection({
				anthropicModel: "claude-sonnet-4-6",
				anthropicModelSelection: ANTHROPIC_CUSTOM_MODEL_ID,
			})
		).toBe(true);
	});

	it("keeps fetched Anthropic models in catalog mode", () => {
		expect(
			isAnthropicCustomModelSelection({
				anthropicModel: "claude-sonnet-4-6",
				anthropicModelSelection: "claude-sonnet-4-6",
				anthropicAvailableModels: [
					modelInfo("claude-sonnet-4-6", "Claude Sonnet 4.6"),
				],
			})
		).toBe(false);
	});
});

describe("Anthropic picker defaults", () => {
	it("starts Anthropic in custom mode before any models are fetched", () => {
		const settings = {
			anthropicModel: "",
		};
		normalizeAnthropicModelSelection(settings);
		expect(settings.anthropicModelSelection).toBe(ANTHROPIC_CUSTOM_MODEL_ID);
	});

	it("preserves saved fetched Anthropic model IDs on load", () => {
		const settings = {
			anthropicModel: "claude-sonnet-4-6",
			anthropicAvailableModels: [
				modelInfo("claude-sonnet-4-6", "Claude Sonnet 4.6"),
			],
		};
		normalizeAnthropicModelSelection(settings);
		expect(settings.anthropicModelSelection).toBe("claude-sonnet-4-6");
	});

	it("marks unknown saved Anthropic model IDs as custom on load", () => {
		const settings = {
			anthropicModel: "claude-unknown-xyz",
		};
		normalizeAnthropicModelSelection(settings);
		expect(settings.anthropicModelSelection).toBe(ANTHROPIC_CUSTOM_MODEL_ID);
	});

	it("keeps a refreshed Anthropic account-specific model in catalog mode", () => {
		const settings = {
			anthropicModel: "claude-account-123",
			anthropicAvailableModels: [
				modelInfo("claude-account-123", "Claude Account 123"),
			],
		};
		normalizeAnthropicModelSelection(settings);
		expect(settings.anthropicModelSelection).toBe("claude-account-123");
		expect(
			isAnthropicCustomModelSelection({
				anthropicModel: "claude-account-123",
				anthropicModelSelection: "claude-account-123",
				anthropicAvailableModels: [
					modelInfo("claude-account-123", "Claude Account 123"),
				],
			})
		).toBe(false);
	});

	it("formats an unavailable Anthropic model message with friendly and raw IDs", () => {
		expect(formatAnthropicUnavailableModelMessage("claude-unknown-xyz")).toBe(
			"This key cannot access Custom model ID (claude-unknown-xyz). Pick another model or check your Anthropic account."
		);
	});

	it("describes fetched Anthropic models with friendly labels and raw IDs", () => {
		expect(
			describeAnthropicModel("claude-sonnet-4-6", [
				modelInfo("claude-sonnet-4-6", "Claude Sonnet 4.6"),
			])
		).toEqual({
			label: "Claude Sonnet 4.6",
			rawId: "claude-sonnet-4-6",
		});
	});

	it("describes custom Anthropic models with a generic label", () => {
		expect(describeAnthropicModel("claude-unknown-xyz")).toEqual({
			label: "Custom model ID",
			rawId: "claude-unknown-xyz",
		});
	});

	it("returns generic hint metadata for fetched Anthropic models", () => {
		expect(
			describeAnthropicModelDetails("claude-haiku-4-5", [
				modelInfo("claude-haiku-4-5", "Claude Haiku 4.5"),
			])
		).toEqual({
			label: "Claude Haiku 4.5",
			rawId: "claude-haiku-4-5",
			hint: {
				quality: "Varies",
				speed: "Varies",
				cost: "Varies",
				context: "Varies",
				generationHint: "Output quality depends on the exact custom model you enter.",
			},
		});
		expect(
			formatAnthropicModelHint("claude-haiku-4-5", [
				modelInfo("claude-haiku-4-5", "Claude Haiku 4.5"),
			])
		).toBe("");
	});

	it("shows a fetch prompt before any Anthropic models are loaded", () => {
		expect(formatAnthropicModelHint("", [])).toBe(
			"Fetch Anthropic models to choose from your account, or enter a custom model ID."
		);
	});

	it("falls back to generic hint metadata for custom Anthropic models", () => {
		expect(describeAnthropicModelDetails("claude-unknown-xyz")).toEqual({
			label: "Custom model ID",
			rawId: "claude-unknown-xyz",
			hint: {
				quality: "Varies",
				speed: "Varies",
				cost: "Varies",
				context: "Varies",
				generationHint: "Output quality depends on the exact custom model you enter.",
			},
		});
		expect(formatAnthropicModelHint("claude-unknown-xyz")).toBe("");
	});
});

describe("Anthropic model refresh", () => {
	it("returns fetched Anthropic models with their provider display names", async () => {
		const refreshed = await refreshAnthropicModelOptions({
			listModels: async () => [
				anthropicModelInfoToByokModelOption(
					modelInfo("claude-sonnet-4-6", "Claude Sonnet 4.6")
				),
				anthropicModelInfoToByokModelOption(
					modelInfo("claude-account-123", "Claude Account 123")
				),
				anthropicModelInfoToByokModelOption(
					modelInfo("claude-haiku-4-5", "Claude Haiku 4.5")
				),
			],
		});
		expect(refreshed.availableModels).toHaveLength(3);
		expect(refreshed.options).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "claude-sonnet-4-6",
					label: "Claude Sonnet 4.6",
				}),
				expect.objectContaining({
					id: "claude-account-123",
					label: "Claude Account 123",
				}),
			])
		);
		expect(refreshed.message).toMatch(/Fetched 3 Anthropic models/i);
	});

	it("dedupes Anthropic models that share the same display name", () => {
		const options = buildAnthropicModelOptions([
			modelInfo("claude-sonnet-4-6-20260101", "Claude Sonnet 4.6"),
			modelInfo("claude-sonnet-4-6-20260202", "Claude Sonnet 4.6"),
		]);
		expect(options.filter((model) => model.label === "Claude Sonnet 4.6")).toHaveLength(1);
		expect(options.some((model) => model.id === "claude-sonnet-4-6-20260101")).toBe(true);
		expect(options.some((model) => model.id === "claude-sonnet-4-6-20260202")).toBe(false);
	});

	it("sorts discovered Anthropic models by family and newest version first", () => {
		const options = buildAnthropicModelOptions([
			modelInfo("claude-opus-4-5", "Claude Opus 4.5"),
			modelInfo("claude-sonnet-4", "Claude Sonnet 4"),
			modelInfo("claude-sonnet-4-5", "Claude Sonnet 4.5"),
			modelInfo("claude-opus-4-7", "Claude Opus 4.7"),
			modelInfo("claude-opus-4-1", "Claude Opus 4.1"),
		]);
		const discoveredLabels = options.map((model) => model.label);
		expect(discoveredLabels).toEqual([
			"Claude Sonnet 4.5",
			"Claude Sonnet 4",
			"Claude Opus 4.7",
			"Claude Opus 4.5",
			"Claude Opus 4.1",
		]);
	});

	it("falls back to an empty fetched-model list when refresh fails", async () => {
		const refreshed = await refreshAnthropicModelOptions({
			listModels: async () => {
				throw new Error("network down");
			},
		});
		expect(refreshed.availableModels).toEqual([]);
		expect(refreshed.options).toEqual(buildAnthropicModelOptions());
		expect(refreshed.message).toMatch(/custom model ID/i);
	});

	it("preserves a saved custom Anthropic model when refresh fails", async () => {
		const refreshed = await refreshAnthropicModelOptions({
			listModels: async () => {
				throw new Error("403 authentication_error");
			},
		});
		const settings = {
			anthropicModel: "claude-unknown-xyz",
			anthropicAvailableModels: refreshed.availableModels,
		};
		normalizeAnthropicModelSelection(settings);
		expect(settings.anthropicModelSelection).toBe(ANTHROPIC_CUSTOM_MODEL_ID);
	});
});
