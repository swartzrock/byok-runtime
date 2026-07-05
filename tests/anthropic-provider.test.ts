import { describe, it, expect } from "vitest";
import { z } from "zod/v3";
import type { ModelInfo } from "@anthropic-ai/sdk/resources/models";
import { AnthropicProvider, type ObjectGenerator } from "../src/providers/anthropic-provider";
import type { TextGenerator } from "../src/providers/ai-sdk-provider";
import { ProviderError } from "../src/providers/types";

function fixedObjectGenerator(value: unknown): {
	generator: ObjectGenerator;
	prompts: string[];
} {
	const prompts: string[] = [];
	const generator: ObjectGenerator = async ({ prompt }) => {
		prompts.push(prompt);
		return value as never;
	};
	return { generator, prompts };
}

function fixedTextGenerator(value: string): {
	textGenerator: TextGenerator;
	prompts: string[];
} {
	const prompts: string[] = [];
	const textGenerator: TextGenerator = async ({ prompt }) => {
		prompts.push(prompt);
		return value;
	};
	return { textGenerator, prompts };
}

const opts = (generator: ObjectGenerator, textGenerator: TextGenerator = async () => "ok") => ({
	apiKey: "sk-ant-test",
	model: "claude-3-5-sonnet-latest",
	generator,
	textGenerator,
});

describe("AnthropicProvider.generateObject", () => {
	it("returns the structured output from the injected generator", async () => {
		const schema = z.object({ answer: z.string() });
		const { generator, prompts } = fixedObjectGenerator({ answer: "42" });
		const p = new AnthropicProvider(opts(generator));
		const out = await p.generateObject({
			prompt: "Answer this.",
			schema,
		});
		expect(out).toEqual({ answer: "42" });
		expect(prompts).toEqual(["Answer this."]);
	});

	it("maps an auth failure to a readable ProviderError", async () => {
		const generator: ObjectGenerator = async () => {
			throw new Error("401 invalid x-api-key");
		};
		const p = new AnthropicProvider(opts(generator));
		await expect(
			p.generateObject({
				prompt: "Hi",
				schema: z.object({ ok: z.boolean() }),
			})
		).rejects.toBeInstanceOf(ProviderError);
		await expect(
			p.generateObject({
				prompt: "Hi",
				schema: z.object({ ok: z.boolean() }),
			})
		).rejects.toThrow(/API key/i);
	});
});

describe("AnthropicProvider.generateText", () => {
	it("returns text from the injected text generator", async () => {
		const { generator } = fixedObjectGenerator({ ok: true });
		const { textGenerator, prompts } = fixedTextGenerator("A text reply.");
		const p = new AnthropicProvider(opts(generator, textGenerator));
		const out = await p.generateText({ prompt: "Write plainly." });
		expect(out).toEqual({ text: "A text reply." });
		expect(prompts).toEqual(["Write plainly."]);
	});
});

describe("AnthropicProvider.testConnection", () => {
	it("reports success when a trivial generation resolves", async () => {
		const generator: ObjectGenerator = async ({ schema }) => {
			expect(schema).toBeInstanceOf(z.ZodType);
			return { ok: true } as never;
		};
		const p = new AnthropicProvider(opts(generator));
		const status = await p.testConnection();
		expect(status.ok).toBe(true);
		expect(status.message).toMatch(/Connected to Anthropic/);
	});

	it("reports a readable failure when the key is rejected", async () => {
		const generator: ObjectGenerator = async () => {
			throw new Error("403 authentication_error");
		};
		const p = new AnthropicProvider(opts(generator));
		const status = await p.testConnection();
		expect(status.ok).toBe(false);
		expect(status.message).toMatch(/API key/i);
	});
});

describe("AnthropicProvider.listModels", () => {
	it("returns portable model options with display names from the official SDK", async () => {
		const models: ModelInfo[] = [
			{
				id: "claude-account-123",
				display_name: "Claude Account 123",
				type: "model",
				created_at: "2026-01-01T00:00:00Z",
				max_input_tokens: 1000,
				max_tokens: 1000,
				capabilities: null,
			},
		];
		const fetchMock = async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : input.toString();
			expect(url).toContain("/v1/models");
			return new Response(
				JSON.stringify({
					data: models,
					first_id: "claude-account-123",
					last_id: "claude-account-123",
					has_more: false,
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				}
			);
		};
		const p = new AnthropicProvider({
			apiKey: "sk-ant-test",
			model: "claude-3-5-sonnet-latest",
			fetchImpl: fetchMock as never,
		});
		const listed = await p.listModels();
		expect(listed).toEqual([{ id: "claude-account-123", label: "Claude Account 123" }]);
	});
});
