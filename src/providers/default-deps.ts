import { ByokProviderError } from "../types";

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
export const DEFAULT_LM_STUDIO_BASE_URL = "http://localhost:1234/v1";

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

export function normalizeLmStudioBaseUrl(url: string = DEFAULT_LM_STUDIO_BASE_URL): string {
	const candidate = url.trim() || DEFAULT_LM_STUDIO_BASE_URL;
	let parsed: URL;
	try {
		parsed = new URL(candidate);
	} catch {
		throw new ByokProviderError("LM Studio URL must be a valid http(s) URL.");
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new ByokProviderError("LM Studio URL must use http or https.");
	}
	if (parsed.username || parsed.password) {
		throw new ByokProviderError("LM Studio URL must not include credentials.");
	}
	const normalized = parsed.toString().replace(/\/+$/, "");
	return parsed.pathname === "/" ? `${normalized}/v1` : normalized;
}
