import { describe, expect, it, vi } from "vitest";
import { ByokProviderError, createByok, streamText, type ByokTransport } from "../src";

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

		const transport = Object.assign(fetchImpl as ByokTransport, { supportsStreaming: true });
		const result = streamText({
			provider: "openai",
			apiKey: "sk-test",
			model: "gpt-4o-mini",
			prompt: "Say hi.",
			deps: { transport },
		});

		expect(result.delivery).toBe("native");
		expect(fetchImpl).not.toHaveBeenCalled();
		await expect(collectText(result.textStream)).resolves.toBe("One response.");
	});

	it("shares caller cancellation with the underlying native request", async () => {
		let requestSignal: AbortSignal | undefined;
		const transport = Object.assign(
			vi.fn((request: Request) => {
				requestSignal = request.signal;
				return new Promise<Response>((_resolve, reject) => {
					requestSignal?.addEventListener(
						"abort",
						() => reject(new DOMException("Aborted", "AbortError")),
						{ once: true }
					);
				});
			}),
			{ supportsStreaming: true }
		);
		const controller = new AbortController();
		const result = streamText({
			provider: "openai",
			apiKey: "sk-test",
			model: "gpt-4o-mini",
			prompt: "Say hi.",
			signal: controller.signal,
			deps: { transport },
		});
		const pending = result.textStream[Symbol.asyncIterator]()
			.next()
			.then(
				() => undefined,
				(error: unknown) => error
			);

		await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
		controller.abort();

		expect(requestSignal?.aborted).toBe(true);
		await expect(pending).resolves.toBeInstanceOf(ByokProviderError);
		expect(transport).toHaveBeenCalledTimes(1);
	});

	it("is lazy and buffers unsupported transports into one exact delta", async () => {
		const transport = vi.fn<ByokTransport>(
			async () => new Response(JSON.stringify({ response: "  Exact\ntext.  " }))
		);

		const result = streamText({
			provider: "ollama",
			model: "llama3.1:8b",
			prompt: "Say hi.",
			deps: { transport },
		});

		expect(result.delivery).toBe("buffered");
		expect(transport).not.toHaveBeenCalled();
		const deltas: string[] = [];
		for await (const delta of result.textStream) deltas.push(delta);
		expect(deltas).toEqual(["  Exact\ntext.  "]);
		expect(transport).toHaveBeenCalledTimes(1);
	});

	it("exposes the same lazy stream through credential-bound clients", async () => {
		const transport = vi.fn<ByokTransport>(
			async () => new Response(JSON.stringify({ response: "Client response." }))
		);
		const client = createByok({ provider: "ollama", deps: { transport } });

		const result = client.streamText({
			model: "llama3.1:8b",
			prompt: "Say hi.",
		});

		expect(transport).not.toHaveBeenCalled();
		await expect(collectText(result.textStream)).resolves.toBe("Client response.");
	});

	it("rejects a second consumer without repeating generation", async () => {
		const transport = vi.fn<ByokTransport>(
			async () => new Response(JSON.stringify({ response: "Once." }))
		);
		const result = streamText({
			provider: "ollama",
			model: "llama3.1:8b",
			prompt: "Say hi.",
			deps: { transport },
		});

		await expect(collectText(result.textStream)).resolves.toBe("Once.");
		await expect(collectText(result.textStream)).rejects.toThrow(/only be consumed once/i);
		expect(transport).toHaveBeenCalledTimes(1);
	});
});
