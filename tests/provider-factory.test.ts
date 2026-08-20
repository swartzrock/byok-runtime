import { afterEach, describe, expect, it, vi } from "vitest";
import { ByokProviderError, type ByokCoreProviderConfig, type ByokTransport } from "../src";
import { createByokProvider } from "../src/providers/provider-factory";
import { createByokNodeProvider, type ByokProviderConfig } from "../src/node";

const fetchImpl = (async () => new Response("{}")) as typeof fetch;
const transport = fetchImpl as ByokTransport;

describe("createByokProvider", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each([
		[{ provider: "ollama", url: "http://localhost:11434", model: "llama3.1:8b" }, "ollama"],
		[{ provider: "anthropic", apiKey: "sk-ant-test", model: "claude-sonnet-4-6" }, "anthropic"],
		[{ provider: "openai", apiKey: "sk-openai-test", model: "gpt-4o-mini" }, "openai"],
		[{ provider: "google", apiKey: "AIza-test", model: "gemini-1.5-flash" }, "google"],
		[{ provider: "xai", apiKey: "xai-test", model: "grok-2-latest" }, "xai"],
		[{ provider: "openrouter", apiKey: "sk-or-test", model: "openai/gpt-4o" }, "openrouter"],
		[{ provider: "groq", apiKey: "gsk-test", model: "llama-3.3-70b-versatile" }, "groq"],
		[{ provider: "mistral", apiKey: "mistral-test", model: "mistral-small-latest" }, "mistral"],
		[{ provider: "deepseek", apiKey: "deepseek-test", model: "deepseek-chat" }, "deepseek"],
		[
			{
				provider: "deepinfra",
				apiKey: "deepinfra-test",
				model: "meta-llama/Meta-Llama-3.1-8B-Instruct",
			},
			"deepinfra",
		],
		[
			{ provider: "together", apiKey: "together-test", model: "meta-llama/Llama-3.3-70B-Instruct" },
			"together",
		],
		[
			{
				provider: "fireworks",
				apiKey: "fireworks-test",
				model: "accounts/fireworks/models/deepseek-v3p1",
			},
			"fireworks",
		],
		[{ provider: "lm-studio", model: "qwen2.5-7b-instruct" }, "lm-studio"],
	] as const)("creates the %s runtime", (config, expectedId) => {
		const provider = createByokProvider(config satisfies ByokCoreProviderConfig, {
			transport,
		});
		expect(provider.id).toBe(expectedId);
		expect(provider.label).toBeTruthy();
	});

	it("creates cloud runtimes with a default global fetch", () => {
		vi.stubGlobal("fetch", fetchImpl);

		const provider = createByokProvider({
			provider: "openai",
			apiKey: "sk-openai-test",
			model: "gpt-4o-mini",
		});

		expect(provider.id).toBe("openai");
	});

	it("allows Ollama callers to provide the unified HTTP transport", () => {
		vi.stubGlobal("fetch", undefined);

		const provider = createByokProvider(
			{
				provider: "ollama",
				url: "http://localhost:11434",
				model: "llama3.1:8b",
			},
			{ transport }
		);

		expect(provider.id).toBe("ollama");
	});

	it("defaults Ollama to the local server URL", async () => {
		const requests: Request[] = [];
		const provider = createByokProvider(
			{
				provider: "ollama",
				model: "llama3.1:8b",
			},
			{
				transport: async (request) => {
					requests.push(request);
					return new Response(JSON.stringify({ response: "Default local server." }), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				},
			}
		);

		await provider.generateText({ prompt: "Say hi." });

		expect(requests[0]?.url).toBe("http://localhost:11434/api/generate");
	});

	it("defaults LM Studio to the local OpenAI-compatible v1 URL", async () => {
		const requests: Array<{ url: string; body?: string }> = [];
		const provider = createByokProvider(
			{
				provider: "lm-studio",
				model: "qwen2.5-7b-instruct",
			},
			{
				transport: async (request) => {
					requests.push({ url: request.url, body: await request.text() });
					return new Response(
						JSON.stringify({ choices: [{ message: { content: "Local response." } }] }),
						{ status: 200, headers: { "content-type": "application/json" } }
					);
				},
			}
		);

		await expect(provider.generateText({ prompt: "Say hi." })).resolves.toEqual({
			text: "Local response.",
		});
		expect(requests[0]?.url).toBe("http://localhost:1234/v1/chat/completions");
		expect(JSON.parse(requests[0]?.body ?? "{}")).toMatchObject({
			model: "qwen2.5-7b-instruct",
			messages: [{ role: "user", content: "Say hi." }],
		});
		expect(provider.requiresNetwork).toBe(false);
	});

	it("treats blank Ollama URLs as the default local server URL", async () => {
		const requests: Request[] = [];
		const provider = createByokProvider(
			{
				provider: "ollama",
				url: " ",
				model: "llama3.1:8b",
			},
			{
				transport: async (request) => {
					requests.push(request);
					return new Response(JSON.stringify({ response: "Default local server." }), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				},
			}
		);

		await provider.generateText({ prompt: "Say hi." });

		expect(requests[0]?.url).toBe("http://localhost:11434/api/generate");
	});

	it("throws a readable error when cloud providers have no fetch", () => {
		vi.stubGlobal("fetch", undefined);

		expect(() =>
			createByokProvider({
				provider: "openai",
				apiKey: "sk-openai-test",
				model: "gpt-4o-mini",
			})
		).toThrow(ByokProviderError);
	});

	it.each(["file:///tmp/ollama.sock", "javascript:alert(1)", "not a url"])(
		"rejects invalid Ollama URL %s",
		(url) => {
			expect(() =>
				createByokProvider({ provider: "ollama", url, model: "llama3.1:8b" }, { transport })
			).toThrow(ByokProviderError);
		}
	);

	it("rejects Ollama URLs with embedded credentials", () => {
		expect(() =>
			createByokProvider(
				{
					provider: "ollama",
					url: "http://user:pass@localhost:11434",
					model: "llama3.1:8b",
				},
				{ transport }
			)
		).toThrow(ByokProviderError);
	});

	it.each(["file:///tmp/lm-studio.sock", "javascript:alert(1)", "not a url"])(
		"rejects invalid LM Studio URL %s",
		(url) => {
			expect(() =>
				createByokProvider(
					{ provider: "lm-studio", url, model: "qwen2.5-7b-instruct" },
					{ transport }
				)
			).toThrow(ByokProviderError);
		}
	);

	it("rejects LM Studio URLs with embedded credentials", () => {
		expect(() =>
			createByokProvider(
				{
					provider: "lm-studio",
					url: "http://user:pass@localhost:1234/v1",
					model: "qwen2.5-7b-instruct",
				},
				{ transport }
			)
		).toThrow(ByokProviderError);
	});

	it("caps transport response bodies", async () => {
		const provider = createByokProvider(
			{ provider: "ollama", model: "llama3.1:8b" },
			{ transport: async () => new Response("x".repeat(1_000_001)) }
		);
		await expect(provider.generateText({ prompt: "Say hi." })).rejects.toThrow(ByokProviderError);
	});

	it("preserves model-list hooks on discoverable providers", () => {
		const provider = createByokProvider(
			{ provider: "openrouter", apiKey: "sk-or-test", model: "openai/gpt-4o" },
			{ transport }
		);

		expect(typeof provider.listModels).toBe("function");
	});

	it.each([
		[
			"anthropic",
			"https://api.anthropic.com/v1/models",
			"claude-account-123",
			"Claude Account 123",
		],
		["openai", "https://api.openai.com/v1/models", "gpt-4o-mini", "gpt-4o-mini"],
		[
			"google",
			"https://generativelanguage.googleapis.com/v1beta/openai/models",
			"gemini-1.5-flash",
			"gemini-1.5-flash",
		],
		["xai", "https://api.x.ai/v1/models", "grok-2-latest", "grok-2-latest"],
		[
			"openrouter",
			"https://openrouter.ai/api/v1/models",
			"anthropic/claude-sonnet-4",
			"Anthropic: Claude Sonnet 4",
		],
		[
			"groq",
			"https://api.groq.com/openai/v1/models",
			"llama-3.3-70b-versatile",
			"llama-3.3-70b-versatile",
		],
		["mistral", "https://api.mistral.ai/v1/models", "mistral-small-latest", "mistral-small-latest"],
		["deepseek", "https://api.deepseek.com/models", "deepseek-chat", "deepseek-chat"],
		[
			"deepinfra",
			"https://api.deepinfra.com/v1/openai/models",
			"meta-llama/Meta-Llama-3.1-8B-Instruct",
			"meta-llama/Meta-Llama-3.1-8B-Instruct",
		],
		[
			"together",
			"https://api.together.ai/v1/models",
			"meta-llama/Llama-3.3-70B-Instruct",
			"meta-llama/Llama-3.3-70B-Instruct",
		],
		["lm-studio", "http://localhost:1234/v1/models", "qwen2.5-7b-instruct", "Qwen 2.5 7B Instruct"],
	] as const)(
		"lists %s models through its OpenAI-compatible base URL",
		async (provider, expectedUrl, modelId, modelLabel) => {
			const requests: Array<{ url: string; headers?: HeadersInit }> = [];
			const runtime = createByokProvider(
				{ provider, apiKey: "key", model: modelId },
				{
					transport: async (request) => {
						requests.push({ url: request.url, headers: request.headers });
						return new Response(
							JSON.stringify({
								data: [{ id: modelId, name: modelLabel, display_name: modelLabel }],
							}),
							{ status: 200, headers: { "content-type": "application/json" } }
						);
					},
				}
			);

			await expect(runtime.listModels()).resolves.toEqual([{ id: modelId, label: modelLabel }]);
			expect(requests[0]?.url).toBe(expectedUrl);
			if (provider === "anthropic") {
				const headers = new Headers(requests[0]?.headers);
				expect(headers.get("x-api-key")).toBe("key");
				expect(headers.get("anthropic-version")).toBe("2023-06-01");
				expect(headers.has("authorization")).toBe(false);
			} else if (provider !== "lm-studio") {
				const headers = new Headers(requests[0]?.headers);
				expect(headers.get("authorization")).toBe("Bearer key");
				expect(headers.has("x-api-key")).toBe(false);
			}
		}
	);

	it("requires Fireworks model IDs to be selected manually", async () => {
		const transport = vi.fn<ByokTransport>(async () => new Response("unexpected request"));
		const runtime = createByokProvider(
			{
				provider: "fireworks",
				apiKey: "fireworks-test",
				model: "accounts/fireworks/models/deepseek-v3p1",
			},
			{ transport }
		);

		await expect(runtime.listModels()).resolves.toEqual([]);
		expect(transport).not.toHaveBeenCalled();
	});

	it.each([
		[
			"together",
			"https://api.together.ai/v1/chat/completions",
			"meta-llama/Llama-3.3-70B-Instruct",
		],
		[
			"fireworks",
			"https://api.fireworks.ai/inference/v1/chat/completions",
			"accounts/fireworks/models/deepseek-v3p1",
		],
	] as const)(
		"generates text through %s's documented inference endpoint",
		async (provider, expectedUrl, model) => {
			const requests: Request[] = [];
			const runtime = createByokProvider(
				{ provider, apiKey: "key", model },
				{
					transport: async (request) => {
						requests.push(request);
						return new Response(
							JSON.stringify({ choices: [{ message: { content: "Provider response." } }] }),
							{ status: 200, headers: { "content-type": "application/json" } }
						);
					},
				}
			);

			await expect(runtime.generateText({ prompt: "Say hi." })).resolves.toEqual({
				text: "Provider response.",
			});
			expect(requests[0]?.url).toBe(expectedUrl);
			expect(requests[0]?.headers.get("authorization")).toBe("Bearer key");
			expect(await requests[0]?.text()).toBe(
				JSON.stringify({ model, messages: [{ role: "user", content: "Say hi." }] })
			);
		}
	);

	it("adds /v1 when an LM Studio caller passes the default server root", async () => {
		const requests: string[] = [];
		const runtime = createByokProvider(
			{ provider: "lm-studio", url: "http://localhost:1234", model: "qwen2.5-7b-instruct" },
			{
				transport: async (request) => {
					requests.push(request.url);
					return new Response(JSON.stringify({ data: [] }), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				},
			}
		);

		await expect(runtime.listModels()).resolves.toEqual([]);
		expect(requests[0]).toBe("http://localhost:1234/v1/models");
	});

	it("keeps CLI model overrides optional on the Node subpath", () => {
		const config: ByokProviderConfig = { provider: "codex-cli", command: "codex" };
		const provider = createByokNodeProvider(config, { transport });

		expect(provider.id).toBe("codex-cli");
		expect(typeof provider.listModels).toBe("function");
	});

	it("creates CLI providers from the Node subpath", () => {
		const provider = createByokNodeProvider(
			{ provider: "claude-cli", command: "claude", model: "sonnet" },
			{ transport }
		);

		expect(provider.id).toBe("claude-cli");
		expect(provider.label).toBe("Claude CLI");
		expect(typeof provider.listModels).toBe("function");
	});
});
