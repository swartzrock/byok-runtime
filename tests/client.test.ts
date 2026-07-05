import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createByok,
	generateText,
	type ByokHttpClient,
} from "../src";

function ollamaHttp(
	requests: Array<Parameters<ByokHttpClient>[0]>
): ByokHttpClient {
	return async (request) => {
		requests.push(request);
		return {
			status: 200,
			text: JSON.stringify({ response: "Plain response." }),
			json: { response: "Plain response." },
		};
	};
}

describe("BYOK client facade", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("generates text through the function-first Ollama facade", async () => {
		const requests: Array<Parameters<ByokHttpClient>[0]> = [];

		const result = await generateText({
			provider: "ollama",
			model: "llama3.1:8b",
			prompt: "Say hi.",
			deps: { http: ollamaHttp(requests) },
		});

		expect(result).toEqual({ text: "Plain response." });
		expect(requests).toHaveLength(1);
		expect(requests[0]?.url).toBe("http://localhost:11434/api/generate");
		expect(JSON.parse(requests[0]?.body ?? "{}")).toMatchObject({
			model: "llama3.1:8b",
			prompt: "Say hi.",
			stream: false,
		});
	});

	it("uses explicit Ollama URLs with the default fetch-backed HTTP adapter", async () => {
		let requestUrl: string | URL | Request | undefined;
		let requestInit: RequestInit | undefined;
		const controller = new AbortController();
		vi.stubGlobal(
			"fetch",
			(async (input, init) => {
				requestUrl = input;
				requestInit = init;
				return new Response(JSON.stringify({ response: "Default transport." }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}) as typeof fetch
		);

		const result = await generateText({
			provider: "ollama",
			url: "http://localhost:11434/",
			model: "llama3.1:8b",
			prompt: "Say hi.",
			signal: controller.signal,
		});

		expect(result).toEqual({ text: "Default transport." });
		expect(requestUrl).toBe("http://localhost:11434/api/generate");
		expect(requestInit?.method).toBe("POST");
		expect(requestInit?.signal).toBe(controller.signal);
		expect(JSON.parse(String(requestInit?.body))).toMatchObject({
			model: "llama3.1:8b",
			prompt: "Say hi.",
			stream: false,
		});
		expect(requestInit?.headers).toMatchObject({
			"Content-Type": "application/json",
		});
	});

	it("preserves Ollama abort errors", async () => {
		const abortError = new DOMException("Aborted", "AbortError");

		await expect(
			generateText({
				provider: "ollama",
				url: "http://localhost:11434",
				model: "llama3.1:8b",
				prompt: "Say hi.",
				deps: {
					http: async () => {
						throw abortError;
					},
				},
			})
		).rejects.toBe(abortError);
	});

	it("forwards abort signals to custom Ollama transports", async () => {
		const requests: Array<Parameters<ByokHttpClient>[0]> = [];
		const controller = new AbortController();

		await generateText({
			provider: "ollama",
			url: "http://localhost:11434",
			model: "llama3.1:8b",
			prompt: "Return JSON.",
			signal: controller.signal,
			deps: { http: ollamaHttp(requests) },
		});

		expect(requests[0]?.signal).toBe(controller.signal);
	});

	it("binds credentials in createByok and requires model per call", async () => {
		const requests: Array<Parameters<ByokHttpClient>[0]> = [];
		const client = createByok({
			provider: "ollama",
			deps: { http: ollamaHttp(requests) },
		});

		const result = await client.generateText({
			model: "llama3.1:8b",
			prompt: "Say hi.",
		});

		expect(result.text).toBe("Plain response.");
		expect("testConnection" in client).toBe(false);
		expect("listModels" in client).toBe(false);
		expect("generateObject" in client).toBe(false);
		expect(JSON.parse(requests[0]?.body ?? "{}")).toMatchObject({
			model: "llama3.1:8b",
		});
	});

});
