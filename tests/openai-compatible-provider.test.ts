import { describe, expect, it } from "vitest";
import { z } from "zod/v3";
import {
	OpenAiCompatibleProvider,
	type CloudObjectGenerator,
	type CloudTextGenerator,
} from "../src/providers/openai-compatible-provider";
import { ProviderError, ProviderRateLimitError } from "../src/providers/types";
import { normalizeStringId, type ModelOption } from "../src/models/model-options";

type FetchCall = {
	url: string;
	init?: RequestInit;
};

function provider(opts: {
	id?: "anthropic" | "openai" | "google" | "xai" | "openrouter";
	label?: string;
	vendor?: string;
	baseURL?: string;
	model?: string;
	fetchImpl?: typeof fetch;
	generator?: CloudObjectGenerator;
	textGenerator?: CloudTextGenerator;
	listModelsImpl?: () => Promise<ModelOption[]>;
}) {
	return new OpenAiCompatibleProvider({
		id: opts.id ?? "openai",
		label: opts.label ?? "OpenAI (ChatGPT)",
		vendor: opts.vendor ?? "OpenAI",
		apiKey: "k",
		model: opts.model ?? "gpt-4o-mini",
		baseURL: opts.baseURL ?? "https://api.openai.com/v1",
		fetchImpl:
			opts.fetchImpl ??
			((async () =>
				new Response(
					JSON.stringify({
						choices: [{ message: { content: "ok" } }],
					}),
					{ status: 200, headers: { "content-type": "application/json" } }
				)) as typeof fetch),
		generator: opts.generator,
		textGenerator: opts.textGenerator,
		listModelsImpl: opts.listModelsImpl,
	});
}

function fixedObjectGenerator(value: unknown): {
	generator: CloudObjectGenerator;
	prompts: string[];
} {
	const prompts: string[] = [];
	const generator: CloudObjectGenerator = async ({ prompt }) => {
		prompts.push(prompt);
		return value as never;
	};
	return { generator, prompts };
}

function fixedTextGenerator(value: string): {
	textGenerator: CloudTextGenerator;
	prompts: string[];
} {
	const prompts: string[] = [];
	const textGenerator: CloudTextGenerator = async ({ prompt }) => {
		prompts.push(prompt);
		return value;
	};
	return { textGenerator, prompts };
}

describe("OpenAiCompatibleProvider", () => {
	it.each([
		["anthropic", "Anthropic (Claude)", "Anthropic"],
		["openai", "OpenAI (ChatGPT)", "OpenAI"],
		["google", "Google (Gemini)", "Google"],
		["xai", "xAI (Grok)", "xAI"],
		["openrouter", "OpenRouter", "OpenRouter"],
	] as const)("exposes provider metadata for %s", (id, label, vendor) => {
		const p = provider({ id, label, vendor });

		expect(p.id).toBe(id);
		expect(p.label).toBe(label);
		expect(p.requiresNetwork).toBe(true);
		expect(p.requiresDownload).toBe(false);
	});

	it("posts text prompts to the configured OpenAI-compatible chat endpoint", async () => {
		const calls: FetchCall[] = [];
		const p = provider({
			baseURL: "https://example.test/v1/",
			fetchImpl: (async (input, init) => {
				calls.push({ url: input.toString(), init });
				return new Response(
					JSON.stringify({ choices: [{ message: { content: "plain reply" } }] }),
					{ status: 200, headers: { "content-type": "application/json" } }
				);
			}) as typeof fetch,
		});

		const out = await p.generateText({ prompt: "Write plainly." });

		expect(out).toEqual({ text: "plain reply" });
		expect(calls[0]?.url).toBe("https://example.test/v1/chat/completions");
		expect(calls[0]?.init?.headers).toMatchObject({
			Authorization: "Bearer k",
			"Content-Type": "application/json",
		});
		expect(JSON.parse(calls[0]?.init?.body as string)).toMatchObject({
			model: "gpt-4o-mini",
			messages: [{ role: "user", content: "Write plainly." }],
		});
	});

	it("parses object responses through the provided zod schema", async () => {
		const calls: FetchCall[] = [];
		const p = provider({
			fetchImpl: (async (input, init) => {
				calls.push({ url: input.toString(), init });
				return new Response(
					JSON.stringify({
						choices: [{ message: { content: '```json\n{"answer":"42"}\n```' } }],
					}),
					{ status: 200, headers: { "content-type": "application/json" } }
				);
			}) as typeof fetch,
		});

		await expect(
			p.generateObject({
				prompt: "Answer this.",
				schema: z.object({ answer: z.string() }),
			})
		).resolves.toEqual({ answer: "42" });

		const body = JSON.parse(calls[0]?.init?.body as string);
		expect(body.response_format).toBeUndefined();
		expect(body.messages[0].content).toContain("Respond with ONLY a valid JSON object");
	});

	it("reprompts once when object JSON misses required schema fields", async () => {
		const calls: FetchCall[] = [];
		const replies = [
			{ choices: [{ message: { content: '{"heading":"Product Promise"}' } }] },
			{
				choices: [
					{
						message: {
							content: '{"heading":"Product Promise","rationale":"Clear value promise."}',
						},
					},
				],
			},
		];
		const p = provider({
			id: "anthropic",
			vendor: "Anthropic",
			fetchImpl: (async (input, init) => {
				calls.push({ url: input.toString(), init });
				return new Response(JSON.stringify(replies.shift()), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}) as typeof fetch,
		});

		await expect(
			p.generateObject({
				prompt: "Analyze this section.",
				schema: z.object({
					heading: z.string(),
					rationale: z.string(),
				}),
			})
		).resolves.toEqual({
			heading: "Product Promise",
			rationale: "Clear value promise.",
		});

		expect(calls).toHaveLength(2);
		const retryBody = JSON.parse(calls[1]?.init?.body as string);
		expect(retryBody.messages[0].content).toContain("Validation error");
		expect(retryBody.messages[0].content).toContain("rationale");
		expect(retryBody.messages[0].content).toContain("Return ONLY a corrected JSON object");
	});

	it("uses injected object and text generators for focused tests", async () => {
		const schema = z.object({ answer: z.string() });
		const { generator, prompts: objectPrompts } = fixedObjectGenerator({ answer: "42" });
		const { textGenerator, prompts: textPrompts } = fixedTextGenerator("plain reply");
		const p = provider({ generator, textGenerator });

		await expect(p.generateObject({ prompt: "Answer this.", schema })).resolves.toEqual({
			answer: "42",
		});
		await expect(p.generateText({ prompt: "Write plainly." })).resolves.toEqual({
			text: "plain reply",
		});
		expect(objectPrompts).toEqual(["Answer this."]);
		expect(textPrompts).toEqual(["Write plainly."]);
	});

	it("retries rate-limit errors before surfacing success", async () => {
		let calls = 0;
		const generator: CloudObjectGenerator = async () => {
			calls++;
			if (calls < 3) {
				throw Object.assign(new Error("429 rate limit"), {
					status: 429,
					retryAfterMs: 0,
				});
			}
			return { ok: true } as never;
		};

		await expect(
			provider({ generator }).generateObject({
				prompt: "Hi",
				schema: z.object({ ok: z.boolean() }),
			})
		).resolves.toEqual({ ok: true });
		expect(calls).toBe(3);
	});

	it("throws ProviderRateLimitError after retry budget is exhausted", async () => {
		let calls = 0;
		const generator: CloudObjectGenerator = async () => {
			calls++;
			throw Object.assign(new Error("429 rate limit"), {
				status: 429,
				retryAfterMs: 0,
			});
		};

		await expect(
			provider({ generator }).generateObject({
				prompt: "Hi",
				schema: z.object({ ok: z.boolean() }),
			})
		).rejects.toBeInstanceOf(ProviderRateLimitError);
		expect(calls).toBe(3);
	});

	it("maps auth errors to vendor-named ProviderError messages", async () => {
		const generator: CloudObjectGenerator = async () => {
			throw new Error("401 unauthorized invalid api key");
		};

		await expect(
			provider({ generator }).generateObject({
				prompt: "Hi",
				schema: z.object({ ok: z.boolean() }),
			})
		).rejects.toThrow(/OpenAI rejected the API key/);
		await expect(
			provider({ generator }).generateObject({
				prompt: "Hi",
				schema: z.object({ ok: z.boolean() }),
			})
		).rejects.toBeInstanceOf(ProviderError);
	});

	it("testConnection reports success and readable auth failures", async () => {
		const ok = await provider({
			generator: async ({ schema }) => {
				expect(schema).toBeInstanceOf(z.ZodType);
				return { ok: true } as never;
			},
		}).testConnection();
		expect(ok).toEqual({
			ok: true,
			message: "Connected to OpenAI (gpt-4o-mini).",
		});

		const rejected = await provider({
			generator: async () => {
				throw new Error("403 authentication_error");
			},
		}).testConnection();
		expect(rejected.ok).toBe(false);
		expect(rejected.message).toMatch(/API key/i);
	});

	it("lists models through the OpenAI-compatible models endpoint", async () => {
		const p = provider({
			fetchImpl: (async () =>
				new Response(
					JSON.stringify({
						data: [
							{ id: "gpt-4o-mini", object: "model", created: 0, owned_by: "openai" },
							{ id: "", object: "model", created: 0, owned_by: "openai" },
						],
					}),
					{ status: 200, headers: { "content-type": "application/json" } }
				)) as typeof fetch,
		});

		await expect(p.listModels()).resolves.toEqual([{ id: "gpt-4o-mini", label: "gpt-4o-mini" }]);
	});

	it("preserves list model injection", async () => {
		const expected = ["gpt-4o-mini", "gpt-4.1"].map((id) => normalizeStringId(id));
		await expect(provider({ listModelsImpl: async () => expected }).listModels()).resolves.toEqual(
			expected
		);
	});
});
