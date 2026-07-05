import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ByokProviderError,
	type ByokCoreProviderConfig,
	type ByokHttpClient,
} from "../src";
import { createByokProvider } from "../src/providers/provider-factory";
import {
	createByokNodeProvider,
	type ByokProviderConfig,
} from "../src/node";
import { createDefaultHttpClient } from "../src/providers/default-deps";

const http: ByokHttpClient = async () => ({ status: 200, text: "{}", json: {} });
const fetchImpl = (async () => new Response("{}")) as typeof fetch;

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
	] as const)("creates the %s runtime", (config, expectedId) => {
		const provider = createByokProvider(config satisfies ByokCoreProviderConfig, {
			fetchImpl,
			http,
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

	it("allows Ollama callers to provide only an HTTP transport", () => {
		vi.stubGlobal("fetch", undefined);

		const provider = createByokProvider(
			{
				provider: "ollama",
				url: "http://localhost:11434",
				model: "llama3.1:8b",
			},
			{ http }
		);

		expect(provider.id).toBe("ollama");
	});

	it("defaults Ollama to the local server URL", async () => {
		const requests: Parameters<ByokHttpClient>[0][] = [];
		const provider = createByokProvider(
			{
				provider: "ollama",
				model: "llama3.1:8b",
			},
			{
				http: async (request) => {
					requests.push(request);
					return {
						status: 200,
						text: JSON.stringify({ response: "Default local server." }),
						json: { response: "Default local server." },
					};
				},
			}
		);

		await provider.generateText({ prompt: "Say hi." });

		expect(requests[0]?.url).toBe("http://localhost:11434/api/generate");
	});

	it("treats blank Ollama URLs as the default local server URL", async () => {
		const requests: Parameters<ByokHttpClient>[0][] = [];
		const provider = createByokProvider(
			{
				provider: "ollama",
				url: " ",
				model: "llama3.1:8b",
			},
			{
				http: async (request) => {
					requests.push(request);
					return {
						status: 200,
						text: JSON.stringify({ response: "Default local server." }),
						json: { response: "Default local server." },
					};
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
				createByokProvider(
					{ provider: "ollama", url, model: "llama3.1:8b" },
					{ http }
				)
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
				{ http }
			)
		).toThrow(ByokProviderError);
	});

	it("caps default HTTP response bodies", async () => {
		const client = createDefaultHttpClient(
			(async () => new Response("x".repeat(1_000_001))) as typeof fetch
		);

		await expect(
			client({ url: "http://localhost:11434/api/generate", method: "POST" })
		).rejects.toThrow(ByokProviderError);
	});

	it("preserves model-list hooks on discoverable providers", () => {
		const provider = createByokProvider(
			{ provider: "openrouter", apiKey: "sk-or-test", model: "openai/gpt-4o" },
			{ fetchImpl, http }
		);

		expect(typeof provider.listModels).toBe("function");
	});

	it("keeps CLI model overrides optional on the Node subpath", () => {
		const config: ByokProviderConfig = { provider: "codex-cli", command: "codex" };
		const provider = createByokNodeProvider(config, { fetchImpl, http });

		expect(provider.id).toBe("codex-cli");
		expect(typeof provider.listModels).toBe("function");
	});

	it("creates CLI providers from the Node subpath", () => {
		const provider = createByokNodeProvider(
			{ provider: "claude-cli", command: "claude", model: "sonnet" },
			{ fetchImpl, http }
		);

		expect(provider.id).toBe("claude-cli");
		expect(provider.label).toBe("Claude CLI");
		expect(typeof provider.listModels).toBe("function");
	});
});
