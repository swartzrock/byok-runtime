import { describe, it, expect, vi } from "vitest";
import { OllamaProvider } from "../src/providers/ollama-provider";
import { type HttpClient, type HttpResponse, ProviderError } from "../src/providers/types";

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
		await expect(p.listModels()).resolves.toEqual([{ id: "test-model", label: "test-model" }]);
	});

	it("reports success when the model is available", async () => {
		const p = new OllamaProvider(baseOpts(generateClient([])));
		const status = await p.testConnection();
		expect(status.ok).toBe(true);
		expect(status.models).toContain("test-model");
	});

	it("reports a missing model clearly", async () => {
		const http: HttpClient = async () => jsonResponse({ models: [{ name: "other" }] });
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
		expect(spy.mock.calls[0][0].body).toBe(
			JSON.stringify({ model: "test-model", prompt: "Say hi", stream: false })
		);
	});

	it("sends instructions through Ollama's native system field", async () => {
		const spy = vi.fn(generateClient(["plain response"]));
		const p = new OllamaProvider(baseOpts(spy));

		await p.generateText({
			instructions: "  Answer as an editor.\n",
			prompt: "  Rewrite this.\n",
			responseFormat: "json",
		});

		expect(JSON.parse(spy.mock.calls[0][0].body as string)).toEqual({
			model: "test-model",
			prompt: "  Rewrite this.\n",
			system: "  Answer as an editor.\n",
			stream: false,
			format: "json",
		});
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
		await expect(p.generateText({ prompt: "Hi" })).rejects.toBeInstanceOf(ProviderError);
	});

	it("surfaces the server's error body and a status hint on HTTP 500", async () => {
		const http: HttpClient = async (req) => {
			if (req.url.endsWith("/api/tags")) {
				return jsonResponse({ models: [{ name: "test-model" }] });
			}
			return jsonResponse({ error: "model requires more system memory" }, 500);
		};
		const p = new OllamaProvider(baseOpts(http));
		await expect(p.generateText({ prompt: "Hi" })).rejects.toThrow(
			/HTTP 500.*memory.*model requires more system memory/i
		);
	});

	it("hints to pull the model on HTTP 404", async () => {
		const http: HttpClient = async () => jsonResponse({ error: "model 'x' not found" }, 404);
		const p = new OllamaProvider(baseOpts(http));
		await expect(p.generateText({ prompt: "Hi" })).rejects.toThrow(
			/HTTP 404.*ollama pull.*not found/i
		);
	});
});

describe("OllamaProvider.streamText", () => {
	it("streams exact native deltas and aborts when iteration stops", async () => {
		let signal: AbortSignal | undefined;
		let pull = 0;
		const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			signal = init?.signal ?? undefined;
			return new Response(
				new ReadableStream<Uint8Array>({
					pull(controller) {
						if (pull++ > 0) return;
						controller.enqueue(
							new TextEncoder().encode(
								`${JSON.stringify({ response: "  First\n", done: false })}\n`
							)
						);
					},
				}),
				{ status: 200, headers: { "content-type": "application/x-ndjson" } }
			);
		});
		const p = new OllamaProvider({ ...baseOpts(generateClient([])), fetchImpl });
		const result = p.streamText?.({ prompt: "Say hi" });

		expect(result?.delivery).toBe("native");
		expect(fetchImpl).not.toHaveBeenCalled();
		for await (const delta of result!.textStream) {
			expect(delta).toBe("  First\n");
			break;
		}

		expect(signal?.aborted).toBe(true);
		expect(JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string)).toMatchObject({
			model: "test-model",
			prompt: "Say hi",
			stream: true,
		});
	});

	it("aborts a native request before response headers arrive", async () => {
		let requestSignal: AbortSignal | undefined;
		const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
			requestSignal = init?.signal ?? undefined;
			return new Promise<Response>((_resolve, reject) => {
				const rejectOnAbort = (): void => reject(new DOMException("Aborted", "AbortError"));
				if (requestSignal?.aborted) rejectOnAbort();
				else requestSignal?.addEventListener("abort", rejectOnAbort, { once: true });
			});
		});
		const controller = new AbortController();
		const p = new OllamaProvider({ ...baseOpts(generateClient([])), fetchImpl });
		const result = p.streamText?.({ prompt: "Say hi" }, controller.signal);
		const iterator = result!.textStream[Symbol.asyncIterator]();
		const nextResult = iterator.next().then(
			() => undefined,
			(error: unknown) => error
		);

		await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
		expect(requestSignal?.aborted).toBe(false);
		controller.abort();

		expect(requestSignal?.aborted).toBe(true);
		await expect(nextResult).resolves.toMatchObject({ name: "AbortError" });
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});
});
