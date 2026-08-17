import { describe, it, expect, vi } from "vitest";
import type { ByokTransport } from "../src";
import { OllamaProvider } from "../src/providers/ollama-provider";
import { ProviderError } from "../src/providers/types";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function generateTransport(responses: string[]): ByokTransport {
	let i = 0;
	return async (request) => {
		if (request.url.endsWith("/api/tags")) {
			return jsonResponse({ models: [{ name: "test-model" }] });
		}
		const resp = responses[Math.min(i, responses.length - 1)];
		i++;
		return jsonResponse({ response: resp });
	};
}

const baseOpts = (transport: ByokTransport) => ({
	url: "http://localhost:11434/",
	model: "test-model",
	transport,
});

describe("OllamaProvider.testConnection", () => {
	it("lists locally installed model ids", async () => {
		const p = new OllamaProvider(baseOpts(generateTransport([])));
		await expect(p.listModels()).resolves.toEqual([{ id: "test-model", label: "test-model" }]);
	});

	it("reports success when the model is available", async () => {
		const p = new OllamaProvider(baseOpts(generateTransport([])));
		const status = await p.testConnection();
		expect(status.ok).toBe(true);
		expect(status.models).toContain("test-model");
	});

	it("reports a missing model clearly", async () => {
		const transport: ByokTransport = async () => jsonResponse({ models: [{ name: "other" }] });
		const p = new OllamaProvider(baseOpts(transport));
		const status = await p.testConnection();
		expect(status.ok).toBe(false);
		expect(status.message).toMatch(/not installed/);
	});

	it("reports unreachable when the request throws", async () => {
		const transport: ByokTransport = async () => {
			throw new Error("ECONNREFUSED");
		};
		const p = new OllamaProvider(baseOpts(transport));
		const status = await p.testConnection();
		expect(status.ok).toBe(false);
		expect(status.message).toMatch(/unreachable/);
	});
});

describe("OllamaProvider.generateText", () => {
	it("returns raw generated text", async () => {
		const spy = vi.fn(generateTransport(["plain response"]));
		const p = new OllamaProvider(baseOpts(spy));
		const out = await p.generateText({ prompt: "Say hi" });
		expect(out).toEqual({ text: "plain response" });
		expect(spy).toHaveBeenCalledTimes(1);
		expect(await spy.mock.calls[0][0].json()).toEqual({
			model: "test-model",
			prompt: "Say hi",
			stream: false,
		});
	});

	it("sends instructions through Ollama's native system field", async () => {
		const spy = vi.fn(generateTransport(["plain response"]));
		const p = new OllamaProvider(baseOpts(spy));

		await p.generateText({
			instructions: "  Answer as an editor.\n",
			prompt: "  Rewrite this.\n",
			responseFormat: "json",
		});

		expect(await spy.mock.calls[0][0].json()).toEqual({
			model: "test-model",
			prompt: "  Rewrite this.\n",
			system: "  Answer as an editor.\n",
			stream: false,
			format: "json",
		});
	});

	it("requests Ollama JSON mode for json responses", async () => {
		const spy = vi.fn(generateTransport(['{"ok":true}']));
		const p = new OllamaProvider(baseOpts(spy));
		const out = await p.generateText({
			prompt: "Return JSON",
			responseFormat: "json",
		});
		expect(out.text).toBe('{"ok":true}');
		const body = (await spy.mock.calls[0][0].json()) as Record<string, unknown>;
		expect(body.format).toBe("json");
	});

	it("throws ProviderError when the server is unreachable", async () => {
		const transport: ByokTransport = async (request) => {
			if (request.url.endsWith("/api/generate")) throw new Error("down");
			return jsonResponse({ models: [{ name: "test-model" }] });
		};
		const p = new OllamaProvider(baseOpts(transport));
		await expect(p.generateText({ prompt: "Hi" })).rejects.toBeInstanceOf(ProviderError);
	});

	it("surfaces the server's error body and a status hint on HTTP 500", async () => {
		const transport: ByokTransport = async (request) => {
			if (request.url.endsWith("/api/tags")) {
				return jsonResponse({ models: [{ name: "test-model" }] });
			}
			return jsonResponse({ error: "model requires more system memory" }, 500);
		};
		const p = new OllamaProvider(baseOpts(transport));
		await expect(p.generateText({ prompt: "Hi" })).rejects.toThrow(
			/HTTP 500.*memory.*model requires more system memory/i
		);
	});

	it("hints to pull the model on HTTP 404", async () => {
		const transport: ByokTransport = async () =>
			jsonResponse({ error: "model 'x' not found" }, 404);
		const p = new OllamaProvider(baseOpts(transport));
		await expect(p.generateText({ prompt: "Hi" })).rejects.toThrow(
			/HTTP 404.*ollama pull.*not found/i
		);
	});
});

describe("OllamaProvider.streamText", () => {
	it("streams exact native deltas and aborts when iteration stops", async () => {
		let signal: AbortSignal | undefined;
		let pull = 0;
		const transport = Object.assign(
			vi.fn(async (request: Request) => {
				signal = request.signal;
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
			}),
			{ supportsStreaming: true }
		);
		const p = new OllamaProvider(baseOpts(transport));
		const result = p.streamText?.({ prompt: "Say hi" });

		expect(result?.delivery).toBe("native");
		expect(transport).not.toHaveBeenCalled();
		for await (const delta of result!.textStream) {
			expect(delta).toBe("  First\n");
			break;
		}

		expect(signal?.aborted).toBe(true);
		expect(await transport.mock.calls[0]?.[0].json()).toMatchObject({
			model: "test-model",
			prompt: "Say hi",
			stream: true,
		});
	});

	it("aborts a native request before response headers arrive", async () => {
		let requestSignal: AbortSignal | undefined;
		const transport = Object.assign(
			vi.fn((request: Request) => {
				requestSignal = request.signal;
				return new Promise<Response>((_resolve, reject) => {
					const rejectOnAbort = (): void => reject(new DOMException("Aborted", "AbortError"));
					if (requestSignal?.aborted) rejectOnAbort();
					else requestSignal?.addEventListener("abort", rejectOnAbort, { once: true });
				});
			}),
			{ supportsStreaming: true }
		);
		const controller = new AbortController();
		const p = new OllamaProvider(baseOpts(transport));
		const result = p.streamText?.({ prompt: "Say hi" }, controller.signal);
		const iterator = result!.textStream[Symbol.asyncIterator]();
		const nextResult = iterator.next().then(
			() => undefined,
			(error: unknown) => error
		);

		await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
		expect(requestSignal?.aborted).toBe(false);
		controller.abort();

		expect(requestSignal?.aborted).toBe(true);
		await expect(nextResult).resolves.toMatchObject({ name: "AbortError" });
		expect(transport).toHaveBeenCalledTimes(1);
	});
});
