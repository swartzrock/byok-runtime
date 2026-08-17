import { afterEach, describe, expect, it, vi } from "vitest";
import { createByok, generateText, type ByokTransport } from "../src";

function ollamaTransport(requests: Request[]): ByokTransport {
	return async (request) => {
		requests.push(request);
		return new Response(JSON.stringify({ response: "Plain response." }), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	};
}

describe("BYOK client facade", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("generates text through the function-first Ollama facade", async () => {
		const requests: Request[] = [];

		const result = await generateText({
			provider: "ollama",
			model: "llama3.1:8b",
			prompt: "Say hi.",
			deps: { transport: ollamaTransport(requests) },
		});

		expect(result).toEqual({ text: "Plain response." });
		expect(requests).toHaveLength(1);
		expect(requests[0]?.url).toBe("http://localhost:11434/api/generate");
		expect(await requests[0]?.json()).toMatchObject({
			model: "llama3.1:8b",
			prompt: "Say hi.",
			stream: false,
		});
	});

	it("uses explicit Ollama URLs with the default fetch-backed HTTP adapter", async () => {
		let request: Request | undefined;
		const controller = new AbortController();
		vi.stubGlobal("fetch", (async (input, init) => {
			request = new Request(input, init);
			return new Response(JSON.stringify({ response: "Default transport." }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch);

		const result = await generateText({
			provider: "ollama",
			url: "http://localhost:11434/",
			model: "llama3.1:8b",
			prompt: "Say hi.",
			signal: controller.signal,
		});

		expect(result).toEqual({ text: "Default transport." });
		expect(request?.url).toBe("http://localhost:11434/api/generate");
		expect(request?.method).toBe("POST");
		expect(request?.signal.aborted).toBe(false);
		expect(await request?.json()).toMatchObject({
			model: "llama3.1:8b",
			prompt: "Say hi.",
			stream: false,
		});
		expect(request?.headers.get("content-type")).toBe("application/json");
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
					transport: async () => {
						throw abortError;
					},
				},
			})
		).rejects.toBe(abortError);
	});

	it("forwards abort signals to custom Ollama transports", async () => {
		const requests: Request[] = [];
		const controller = new AbortController();

		await generateText({
			provider: "ollama",
			url: "http://localhost:11434",
			model: "llama3.1:8b",
			prompt: "Return JSON.",
			signal: controller.signal,
			deps: { transport: ollamaTransport(requests) },
		});

		expect(requests[0]?.signal.aborted).toBe(false);
	});

	it("binds credentials in createByok and requires model per call", async () => {
		const requests: Request[] = [];
		const client = createByok({
			provider: "ollama",
			deps: { transport: ollamaTransport(requests) },
		});

		const result = await client.generateText({
			model: "llama3.1:8b",
			prompt: "Say hi.",
		});

		expect(result.text).toBe("Plain response.");
		expect("testConnection" in client).toBe(false);
		expect("listModels" in client).toBe(false);
		expect("generateObject" in client).toBe(false);
		expect(await requests[0]?.json()).toMatchObject({
			model: "llama3.1:8b",
		});
	});
});
