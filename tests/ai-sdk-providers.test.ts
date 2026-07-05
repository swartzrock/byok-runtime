import { describe, it, expect } from "vitest";
import { z } from "zod/v3";
import { OpenAIProvider } from "../src/providers/openai-provider";
import { GoogleProvider } from "../src/providers/google-provider";
import { XaiProvider } from "../src/providers/xai-provider";
import { OpenRouterProvider } from "../src/providers/openrouter-provider";
import type {
	ObjectGenerator,
	TextGenerator,
} from "../src/providers/ai-sdk-provider";
import { ProviderError, ProviderRateLimitError } from "../src/providers/types";
import { normalizeStringId, type ModelOption } from "../src/models/model-options";

type Ctor = new (opts: {
	apiKey: string;
	model: string;
	generator?: ObjectGenerator;
	textGenerator?: TextGenerator;
	fetchImpl?: typeof fetch;
	listModelsImpl?: () => Promise<ModelOption[]>;
}) => {
	id: string;
	label: string;
	generateObject: <T>(
		input: { prompt: string; schema: z.ZodType<T, z.ZodTypeDef, unknown> },
		signal?: AbortSignal
	) => Promise<T>;
	generateText: (
		input: { prompt: string },
		signal?: AbortSignal
	) => Promise<{ text: string }>;
	testConnection: () => Promise<{ ok: boolean; message: string }>;
	listModels: () => Promise<ModelOption[]>;
};

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

const cases: Array<{ name: string; Ctor: Ctor; id: string; vendor: RegExp; model: string }> = [
	{ name: "OpenAIProvider", Ctor: OpenAIProvider, id: "openai", vendor: /OpenAI/, model: "gpt-4o-mini" },
	{ name: "GoogleProvider", Ctor: GoogleProvider, id: "google", vendor: /Google/, model: "gemini-1.5-flash" },
	{ name: "XaiProvider", Ctor: XaiProvider, id: "xai", vendor: /xAI/, model: "grok-2-latest" },
	{ name: "OpenRouterProvider", Ctor: OpenRouterProvider, id: "openrouter", vendor: /OpenRouter/, model: "anthropic/claude-sonnet-4" },
];

for (const c of cases) {
	const make = (
		generator: ObjectGenerator = async () => ({ ok: true }) as never,
		textGenerator: TextGenerator = async () => "ok"
	) =>
		new c.Ctor({
			apiKey: "k",
			model: c.model,
			generator,
			textGenerator,
		});

	describe(c.name, () => {
		it("exposes its id and uses the generic provider shape", () => {
			const p = make();
			expect(p.id).toBe(c.id);
			expect(typeof p.label).toBe("string");
			expect(typeof p.generateText).toBe("function");
			expect(typeof p.generateObject).toBe("function");
		});

		it("passes prompt and schema to generateObject", async () => {
			const schema = z.object({ answer: z.string() });
			const { generator, prompts } = fixedObjectGenerator({ answer: "42" });
			const out = await make(generator).generateObject({
				prompt: "Answer the question.",
				schema,
			});
			expect(out).toEqual({ answer: "42" });
			expect(prompts).toEqual(["Answer the question."]);
		});

		it("returns text from generateText", async () => {
			const { textGenerator, prompts } = fixedTextGenerator("plain reply");
			const out = await make(undefined, textGenerator).generateText({
				prompt: "Write plainly.",
			});
			expect(out).toEqual({ text: "plain reply" });
			expect(prompts).toEqual(["Write plainly."]);
		});

		it("maps an auth error to a vendor-named readable message", async () => {
			const generator: ObjectGenerator = async () => {
				throw new Error("401 unauthorized invalid api key");
			};
			await expect(
				make(generator).generateObject({
					prompt: "Hi",
					schema: z.object({ ok: z.boolean() }),
				})
			).rejects.toThrow(c.vendor);
			await expect(
				make(generator).generateObject({
					prompt: "Hi",
					schema: z.object({ ok: z.boolean() }),
				})
			).rejects.toBeInstanceOf(ProviderError);
		});

		it("retries rate-limit errors before surfacing failure", async () => {
			let calls = 0;
			const generator: ObjectGenerator = async () => {
				calls++;
				if (calls < 3) {
					throw Object.assign(new Error("429 rate limit"), {
						status: 429,
						retryAfterMs: 0,
					});
				}
				return { ok: true } as never;
			};
			const out = await make(generator).generateObject({
				prompt: "Hi",
				schema: z.object({ ok: z.boolean() }),
			});
			expect(out).toEqual({ ok: true });
			expect(calls).toBe(3);
		});

		it("throws ProviderRateLimitError after retry budget is exhausted", async () => {
			let calls = 0;
			const generator: ObjectGenerator = async () => {
				calls++;
				throw Object.assign(new Error("429 rate limit"), {
					status: 429,
					retryAfterMs: 0,
				});
			};
			await expect(
				make(generator).generateObject({
					prompt: "Hi",
					schema: z.object({ ok: z.boolean() }),
				})
			).rejects.toBeInstanceOf(ProviderRateLimitError);
			expect(calls).toBe(3);
		});

		it("testConnection reports success and names the vendor", async () => {
			const generator: ObjectGenerator = async ({ schema }) => {
				expect(schema).toBeInstanceOf(z.ZodType);
				return { ok: true } as never;
			};
			const status = await make(generator).testConnection();
			expect(status.ok).toBe(true);
			expect(status.message).toMatch(c.vendor);
			expect(status.message).toContain(c.model);
		});

		it("testConnection reports a readable failure on auth error", async () => {
			const generator: ObjectGenerator = async () => {
				throw new Error("403 authentication_error");
			};
			const status = await make(generator).testConnection();
			expect(status.ok).toBe(false);
			expect(status.message).toMatch(/API key/i);
		});

		it("listModels returns provider model ids", async () => {
			const modelIdsByProvider: Record<string, string[]> = {
				openai: ["gpt-4o-mini", "gpt-4.1"],
				google: ["gemini-1.5-flash"],
				xai: ["grok-2-latest", "grok-beta"],
				openrouter: ["anthropic/claude-sonnet-4", "openai/gpt-4o"],
			};
			const ids = modelIdsByProvider[c.id] ?? ["grok-2-latest", "grok-beta"];
			const expected = ids.map((id) => normalizeStringId(id));
			const provider = new c.Ctor({
				apiKey: "k",
				model: c.model,
				generator: async () => ({ ok: true }) as never,
				textGenerator: async () => "ok",
				listModelsImpl: async () => expected,
			});
			const result = await provider.listModels();
			expect(result).toEqual(expected);
		});
	});
}

describe("OpenAI model discovery", () => {
	it("normalizes string model IDs to portable options", async () => {
		const fetchImpl = (async () =>
			new Response(
				JSON.stringify({
					data: [
						{ id: "gpt-4o-mini", object: "model", created: 0, owned_by: "openai" },
						{ id: "", object: "model", created: 0, owned_by: "openai" },
					],
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				}
			)) as typeof fetch;

		await expect(
			new OpenAIProvider({
				apiKey: "k",
				model: "gpt-4o-mini",
				fetchImpl,
				generator: async () => ({ ok: true }) as never,
				textGenerator: async () => "ok",
			}).listModels()
		).resolves.toEqual([{ id: "gpt-4o-mini", label: "gpt-4o-mini" }]);
	});
});

describe("OpenRouter model discovery", () => {
	it("normalizes rich model responses to portable options", async () => {
		const fetchImpl = (async () =>
			new Response(
				JSON.stringify({
					data: [
						{
							id: "anthropic/claude-sonnet-4",
							name: "Anthropic: Claude Sonnet 4",
							context_length: 200000,
							pricing: { prompt: "0.000003", completion: "0.000015" },
							supported_parameters: ["response_format"],
						},
					],
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				}
			)) as typeof fetch;

		await expect(
			new OpenRouterProvider({
				apiKey: "k",
				model: "anthropic/claude-sonnet-4",
				fetchImpl,
				generator: async () => ({ ok: true }) as never,
				textGenerator: async () => "ok",
			}).listModels()
		).resolves.toEqual([
			{
				id: "anthropic/claude-sonnet-4",
				label: "Anthropic: Claude Sonnet 4",
			},
		]);
	});

	it("lists OpenRouter models with authorization only", async () => {
		let seenHeaders: Headers | undefined;
		const fetchImpl = (async (_input, init) => {
			seenHeaders = new Headers(init?.headers);
			return new Response(JSON.stringify({ data: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;

		await new OpenRouterProvider({
			apiKey: "k",
			model: "openai/gpt-4o",
			fetchImpl,
			generator: async () => ({ ok: true }) as never,
			textGenerator: async () => "ok",
		}).listModels();

		expect(seenHeaders?.get("Authorization")).toBe("Bearer k");
	});
});
