import { describe, it, expect } from "vitest";
import {
	normalizeStringId,
	normalizeModelIds,
	isModelOption,
	sortModelOptions,
	type ModelOption,
} from "../src/models/model-options";

describe("normalizeStringId", () => {
	it("normalizes a plain model ID from a string-only provider", () => {
		const opt = normalizeStringId("gpt-4o-mini");
		expect(opt).toEqual({
			id: "gpt-4o-mini",
			label: "gpt-4o-mini",
		});
	});

	it("keeps slash-delimited IDs as portable model IDs", () => {
		const opt = normalizeStringId("anthropic/claude-sonnet-4");
		expect(opt.id).toBe("anthropic/claude-sonnet-4");
		expect(opt.label).toBe("anthropic/claude-sonnet-4");
	});
});

describe("normalizeModelIds", () => {
	it("batch-normalizes an array of string IDs", () => {
		const result = normalizeModelIds(["gpt-4o-mini", "gpt-4o"]);
		expect(result).toHaveLength(2);
		expect(result[0].id).toBe("gpt-4o-mini");
		expect(result[0].label).toBe("gpt-4o-mini");
		expect(result[1].id).toBe("gpt-4o");
	});
});

describe("isModelOption", () => {
	it("returns true for a valid ModelOption", () => {
		const opt = normalizeStringId("gpt-4o");
		expect(isModelOption(opt)).toBe(true);
	});

	it("returns false for a plain string", () => {
		expect(isModelOption("gpt-4o")).toBe(false);
	});

	it("returns false for null/undefined", () => {
		expect(isModelOption(null)).toBe(false);
		expect(isModelOption(undefined)).toBe(false);
	});

	it("returns false for an object missing required fields", () => {
		expect(isModelOption({ id: "x" })).toBe(false);
		expect(isModelOption({ label: "GPT-4o" })).toBe(false);
	});
});

describe("sortModelOptions", () => {
	function opt(id: string): ModelOption {
		return normalizeStringId(id);
	}

	it("sorts options by natural ID order", () => {
		const sorted = sortModelOptions([
			opt("openai/gpt-4o"),
			opt("anthropic/claude-sonnet-4"),
			opt("meta-llama/llama-3-70b"),
		]);
		expect(sorted.map((o) => o.id)).toEqual([
			"anthropic/claude-sonnet-4",
			"meta-llama/llama-3-70b",
			"openai/gpt-4o",
		]);
	});

	it("puts the current model first when specified", () => {
		const sorted = sortModelOptions(
			[opt("anthropic/claude-sonnet-4"), opt("openai/gpt-4o"), opt("meta-llama/llama-3-70b")],
			"openai/gpt-4o"
		);
		expect(sorted[0].id).toBe("openai/gpt-4o");
		expect(sorted.map((o) => o.id)).toEqual([
			"openai/gpt-4o",
			"anthropic/claude-sonnet-4",
			"meta-llama/llama-3-70b",
		]);
	});

	it("does not modify the original array", () => {
		const original = [opt("b/z"), opt("a/y")];
		const sorted = sortModelOptions(original);
		expect(original[0].id).toBe("b/z");
		expect(sorted[0].id).toBe("a/y");
	});

	it("handles empty arrays", () => {
		expect(sortModelOptions([])).toEqual([]);
	});

	it("handles currentModelId not in the list", () => {
		const sorted = sortModelOptions([opt("a/x"), opt("b/y")], "c/z");
		expect(sorted.map((o) => o.id)).toEqual(["a/x", "b/y"]);
	});
});
