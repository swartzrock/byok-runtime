import { ByokProviderError, type ByokTextStream } from "./types";

const DONE: IteratorReturnResult<undefined> = { done: true, value: undefined };
export const MAX_BYOK_RESPONSE_BYTES = 1_000_000;

function abortError(signal: AbortSignal): unknown {
	return signal.reason ?? new DOMException("Aborted", "AbortError");
}

function rejectedIterator(error: Error): AsyncIterator<string> {
	return {
		next: () => Promise.reject(error),
		return: () => Promise.resolve(DONE),
	};
}

function lazyTextIterable(
	start: (signal: AbortSignal) => AsyncIterable<string>,
	externalSignal?: AbortSignal
): AsyncIterable<string> {
	let consumed = false;
	return {
		[Symbol.asyncIterator](): AsyncIterator<string> {
			if (consumed) {
				return rejectedIterator(
					new ByokProviderError("BYOK text streams can only be consumed once.")
				);
			}
			consumed = true;

			const controller = new AbortController();
			let source: AsyncIterator<string> | undefined;
			let done = false;
			let initialized = false;
			const onExternalAbort = (): void => controller.abort(externalSignal?.reason);
			const initialize = (): void => {
				if (initialized) return;
				initialized = true;
				if (externalSignal?.aborted) onExternalAbort();
				else externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
			};

			const cleanup = (): void => {
				externalSignal?.removeEventListener("abort", onExternalAbort);
			};
			const abort = (): void => {
				if (!controller.signal.aborted) controller.abort();
				cleanup();
			};
			const closeSource = (): void => {
				const closing = source?.return?.();
				if (closing) void Promise.resolve(closing).catch(() => undefined);
			};

			return {
				async next(): Promise<IteratorResult<string>> {
					if (done) return DONE;
					initialize();
					if (controller.signal.aborted) {
						done = true;
						cleanup();
						throw abortError(controller.signal);
					}
					source ??= start(controller.signal)[Symbol.asyncIterator]();
					try {
						const result = await source.next();
						if (result.done) {
							done = true;
							cleanup();
						}
						return result;
					} catch (error) {
						done = true;
						abort();
						throw error;
					}
				},
				return(): Promise<IteratorResult<string>> {
					if (!done) {
						done = true;
						abort();
						closeSource();
					}
					return Promise.resolve(DONE);
				},
			};
		},
	};
}

export function createTextStream(
	delivery: ByokTextStream["delivery"],
	start: (signal: AbortSignal) => AsyncIterable<string>,
	signal?: AbortSignal
): ByokTextStream {
	return {
		delivery,
		textStream: lazyTextIterable(start, signal),
	};
}

export function createBufferedTextStream(
	generate: (signal: AbortSignal) => Promise<{ text: string }>,
	signal?: AbortSignal
): ByokTextStream {
	return createTextStream(
		"buffered",
		async function* (streamSignal) {
			const output = await generate(streamSignal);
			yield output.text;
		},
		signal
	);
}

export function withResponseSizeLimit(fetchImpl: typeof fetch): typeof fetch {
	return async (input, init) => {
		const response = await fetchImpl(input, init);
		if (!response.body) return response;
		const reader = response.body.getReader();
		let totalBytes = 0;
		const body = new ReadableStream<Uint8Array>({
			async pull(controller) {
				try {
					const result = await reader.read();
					if (result.done) {
						controller.close();
						return;
					}
					totalBytes += result.value.byteLength;
					if (totalBytes > MAX_BYOK_RESPONSE_BYTES) {
						await reader.cancel();
						controller.error(
							new ByokProviderError("BYOK HTTP response exceeded the default size limit.")
						);
						return;
					}
					controller.enqueue(result.value);
				} catch (error) {
					controller.error(error);
				}
			},
			async cancel(reason) {
				await reader.cancel(reason);
			},
		});
		return new Response(body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	};
}
