import { describe, expect, it, vi } from "vitest";
import { ByokProviderError, createByok, streamText, type ByokHttpClient } from "../src";

async function collectText(stream: AsyncIterable<string>): Promise<string> {
	let text = "";
	for await (const delta of stream) text += delta;
	return text;
}

describe("BYOK text streaming facade", () => {
	it("uses native delivery through the public OpenAI facade", async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(
					`data: ${JSON.stringify({ choices: [{ delta: { content: "One " } }] })}\n\n` +
						`data: ${JSON.stringify({ choices: [{ delta: { content: "response." } }] })}\n\n` +
						"data: [DONE]\n\n",
					{ headers: { "content-type": "text/event-stream" } }
				)
		);

		const result = streamText({
			provider: "openai",
			apiKey: "sk-test",
			model: "gpt-4o-mini",
			prompt: "Say hi.",
			deps: { fetchImpl: fetchImpl as typeof fetch },
		});

		expect(result.delivery).toBe("native");
		expect(fetchImpl).not.toHaveBeenCalled();
		await expect(collectText(result.textStream)).resolves.toBe("One response.");
	});

	it("shares caller cancellation with the underlying native request", async () => {
		let requestSignal: AbortSignal | undefined;
		const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
			requestSignal = init?.signal ?? undefined;
			return new Promise<Response>((_resolve, reject) => {
				requestSignal?.addEventListener(
					"abort",
					() => reject(new DOMException("Aborted", "AbortError")),
					{ once: true }
				);
			});
		});
		const controller = new AbortController();
		const result = streamText({
			provider: "openai",
			apiKey: "sk-test",
			model: "gpt-4o-mini",
			prompt: "Say hi.",
			signal: controller.signal,
			deps: { fetchImpl: fetchImpl as typeof fetch },
		});
		const pending = result.textStream[Symbol.asyncIterator]()
			.next()
			.then(
				() => undefined,
				(error: unknown) => error
			);

		await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
		controller.abort();

		expect(requestSignal?.aborted).toBe(true);
		await expect(pending).resolves.toBeInstanceOf(ByokProviderError);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("is lazy and buffers unsupported transports into one exact delta", async () => {
		const http = vi.fn<ByokHttpClient>(async () => ({
			status: 200,
			text: JSON.stringify({ response: "  Exact\ntext.  " }),
			json: { response: "  Exact\ntext.  " },
		}));

		const result = streamText({
			provider: "ollama",
			model: "llama3.1:8b",
			prompt: "Say hi.",
			deps: { http },
		});

		expect(result.delivery).toBe("buffered");
		expect(http).not.toHaveBeenCalled();
		const deltas: string[] = [];
		for await (const delta of result.textStream) deltas.push(delta);
		expect(deltas).toEqual(["  Exact\ntext.  "]);
		expect(http).toHaveBeenCalledTimes(1);
	});

	it("exposes the same lazy stream through credential-bound clients", async () => {
		const http = vi.fn<ByokHttpClient>(async () => ({
			status: 200,
			text: JSON.stringify({ response: "Client response." }),
			json: { response: "Client response." },
		}));
		const client = createByok({ provider: "ollama", deps: { http } });

		const result = client.streamText({
			model: "llama3.1:8b",
			prompt: "Say hi.",
		});

		expect(http).not.toHaveBeenCalled();
		await expect(collectText(result.textStream)).resolves.toBe("Client response.");
	});

	it("rejects a second consumer without repeating generation", async () => {
		const http = vi.fn<ByokHttpClient>(async () => ({
			status: 200,
			text: JSON.stringify({ response: "Once." }),
			json: { response: "Once." },
		}));
		const result = streamText({
			provider: "ollama",
			model: "llama3.1:8b",
			prompt: "Say hi.",
			deps: { http },
		});

		await expect(collectText(result.textStream)).resolves.toBe("Once.");
		await expect(collectText(result.textStream)).rejects.toThrow(/only be consumed once/i);
		expect(http).toHaveBeenCalledTimes(1);
	});
});
