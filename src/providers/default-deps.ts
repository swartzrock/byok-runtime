import {
	ByokProviderError,
	type ByokHttpClient,
	type ByokProviderDeps,
} from "../types";

const MAX_DEFAULT_HTTP_RESPONSE_BYTES = 1_000_000;
export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

function globalFetch(): typeof fetch | undefined {
	const candidate = globalThis.fetch;
	if (typeof candidate !== "function") return undefined;
	return candidate.bind(globalThis) as typeof fetch;
}

export function normalizeOllamaUrl(url: string = DEFAULT_OLLAMA_URL): string {
	const candidate = url.trim() || DEFAULT_OLLAMA_URL;
	let parsed: URL;
	try {
		parsed = new URL(candidate);
	} catch {
		throw new ByokProviderError("Ollama URL must be a valid http(s) URL.");
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new ByokProviderError("Ollama URL must use http or https.");
	}
	if (parsed.username || parsed.password) {
		throw new ByokProviderError("Ollama URL must not include credentials.");
	}
	return parsed.toString().replace(/\/+$/, "");
}

function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
	const out = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

async function readCappedText(response: Response): Promise<string> {
	const body = response.body;
	if (!body) {
		const text = await response.text();
		if (new TextEncoder().encode(text).byteLength > MAX_DEFAULT_HTTP_RESPONSE_BYTES) {
			throw new ByokProviderError("BYOK HTTP response exceeded the default size limit.");
		}
		return text;
	}
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		totalBytes += value.byteLength;
		if (totalBytes > MAX_DEFAULT_HTTP_RESPONSE_BYTES) {
			await reader.cancel();
			throw new ByokProviderError("BYOK HTTP response exceeded the default size limit.");
		}
		chunks.push(value);
	}
	return new TextDecoder().decode(concatChunks(chunks, totalBytes));
}

function parseJson(text: string): unknown {
	try {
		return text ? JSON.parse(text) : null;
	} catch {
		return null;
	}
}

export function createDefaultHttpClient(fetchImpl: typeof fetch): ByokHttpClient {
	return async (request) => {
		const response = await fetchImpl(request.url, {
			method: request.method,
			headers: request.headers,
			body: request.body,
			signal: request.signal,
		});
		const text = await readCappedText(response);
		return {
			status: response.status,
			text,
			json: parseJson(text),
		};
	};
}

export function resolveByokFetchDeps(
	deps: Partial<ByokProviderDeps> | undefined
): Pick<ByokProviderDeps, "fetchImpl"> {
	const fetchImpl = deps?.fetchImpl ?? globalFetch();
	if (!fetchImpl) {
		throw new ByokProviderError(
			"BYOK requires a fetch implementation. Pass deps.fetchImpl in this runtime."
		);
	}
	return { fetchImpl };
}

export function resolveOllamaDeps(
	deps: Partial<ByokProviderDeps> | undefined
): Pick<ByokProviderDeps, "http"> {
	if (deps?.http) return { http: deps.http };
	const { fetchImpl } = resolveByokFetchDeps(deps);
	return {
		http: createDefaultHttpClient(fetchImpl),
	};
}
