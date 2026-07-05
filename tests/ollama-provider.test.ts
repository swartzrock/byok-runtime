import { describe, it, expect, vi } from "vitest";
import { OllamaProvider } from "../src/providers/ollama-provider";
import { ProviderError, HttpClient, HttpResponse } from "../src/providers/types";

function jsonResponse(body: unknown, status = 200): HttpResponse {
	return { status, text: JSON.stringify(body), json: body };
}

function generateClient(responses: string[]): HttpClient {
	let i = 0;
	return async (req) => {
		if (req.url.endsWith("/api/tags")) {
			return jsonResponse({ models: [{ name: "test-model" }] });
		}
		const resp = responses[Math.min(i, responses.length - 1)];
		i++;
		return jsonResponse({ response: resp });
	};
}

const baseOpts = (http: HttpClient) => ({
	url: "http://localhost:11434/",
	model: "test-model",
	http,
});

describe("OllamaProvider.testConnection", () => {
	it("lists locally installed model ids", async () => {
		const p = new OllamaProvider(baseOpts(generateClient([])));
		await expect(p.listModels()).resolves.toEqual([
			{ id: "test-model", label: "test-model" },
		]);
	});

	it("reports success when the model is available", async () => {
		const p = new OllamaProvider(baseOpts(generateClient([])));
		const status = await p.testConnection();
		expect(status.ok).toBe(true);
		expect(status.models).toContain("test-model");
	});

	it("reports a missing model clearly", async () => {
		const http: HttpClient = async () =>
			jsonResponse({ models: [{ name: "other" }] });
		const p = new OllamaProvider(baseOpts(http));
		const status = await p.testConnection();
		expect(status.ok).toBe(false);
		expect(status.message).toMatch(/not installed/);
	});

	it("reports unreachable when the request throws", async () => {
		const http: HttpClient = async () => {
			throw new Error("ECONNREFUSED");
		};
		const p = new OllamaProvider(baseOpts(http));
		const status = await p.testConnection();
		expect(status.ok).toBe(false);
		expect(status.message).toMatch(/unreachable/);
	});
});

describe("OllamaProvider.generateText", () => {
	it("returns raw generated text", async () => {
		const spy = vi.fn(generateClient(["plain response"]));
		const p = new OllamaProvider(baseOpts(spy));
		const out = await p.generateText({ prompt: "Say hi" });
		expect(out).toEqual({ text: "plain response" });
		expect(spy).toHaveBeenCalledTimes(1);
		const body = JSON.parse(spy.mock.calls[0][0].body as string);
		expect(body.prompt).toBe("Say hi");
		expect(body.format).toBeUndefined();
	});

	it("requests Ollama JSON mode for json responses", async () => {
		const spy = vi.fn(generateClient(['{"ok":true}']));
		const p = new OllamaProvider(baseOpts(spy));
		const out = await p.generateText({
			prompt: "Return JSON",
			responseFormat: "json",
		});
		expect(out.text).toBe('{"ok":true}');
		const body = JSON.parse(spy.mock.calls[0][0].body as string);
		expect(body.format).toBe("json");
	});

	it("throws ProviderError when the server is unreachable", async () => {
		const http: HttpClient = async (req) => {
			if (req.url.endsWith("/api/generate")) throw new Error("down");
			return jsonResponse({ models: [{ name: "test-model" }] });
		};
		const p = new OllamaProvider(baseOpts(http));
		await expect(
			p.generateText({ prompt: "Hi" })
		).rejects.toBeInstanceOf(ProviderError);
	});

	it("surfaces the server's error body and a status hint on HTTP 500", async () => {
		const http: HttpClient = async (req) => {
			if (req.url.endsWith("/api/tags")) {
				return jsonResponse({ models: [{ name: "test-model" }] });
			}
			return jsonResponse({ error: "model requires more system memory" }, 500);
		};
		const p = new OllamaProvider(baseOpts(http));
		await expect(
			p.generateText({ prompt: "Hi" })
		).rejects.toThrow(/HTTP 500.*memory.*model requires more system memory/i);
	});

	it("hints to pull the model on HTTP 404", async () => {
		const http: HttpClient = async () =>
			jsonResponse({ error: "model 'x' not found" }, 404);
		const p = new OllamaProvider(baseOpts(http));
		await expect(
			p.generateText({ prompt: "Hi" })
		).rejects.toThrow(/HTTP 404.*ollama pull.*not found/i);
	});
});
