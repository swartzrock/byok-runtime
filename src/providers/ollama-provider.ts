import {
	type AiProvider,
	type HttpClient,
	type HttpResponse,
	ProviderError,
	type ProviderStatus,
	type TextGenerationInput,
	type TextGenerationOutput,
} from "./types";
import { normalizeModelIds, type ModelOption } from "../models/model-options";

/** Pull Ollama's `{ "error": "..." }` body out of a failed response. */
function extractServerError(res: HttpResponse): string {
	const fromJson = (res.json as { error?: unknown } | null)?.error;
	if (typeof fromJson === "string" && fromJson.trim()) return fromJson.trim();
	if (res.text && res.text.trim()) return res.text.trim().slice(0, 300);
	return "no error detail returned";
}

/** Add a hint for the common status codes so the Notice is actionable. */
function describeError(status: number): string {
	if (status === 404) return " — model not found; run `ollama pull <model>`";
	if (status === 400) return " — bad request; the model may not support generation";
	if (status === 500)
		return " — server error; the model may have failed to load (often out of memory)";
	return "";
}

function isAbortError(error: unknown): boolean {
	if (typeof DOMException !== "undefined" && error instanceof DOMException) {
		return error.name === "AbortError";
	}
	return (
		typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
	);
}

export interface OllamaProviderOptions {
	url: string;
	model: string;
	http: HttpClient;
}

export class OllamaProvider implements AiProvider {
	readonly id = "ollama";
	readonly label = "Ollama";
	readonly requiresNetwork = false;
	readonly requiresDownload = false;

	private url: string;
	private model: string;
	private http: HttpClient;

	constructor(opts: OllamaProviderOptions) {
		this.url = opts.url.replace(/\/+$/, "");
		this.model = opts.model;
		this.http = opts.http;
	}

	async testConnection(): Promise<ProviderStatus> {
		let models: string[];
		try {
			models = await this.listModelIds();
		} catch {
			return {
				ok: false,
				message: "Ollama server unreachable. Check the URL and that Ollama is running.",
			};
		}
		if (this.model && !models.includes(this.model)) {
			return {
				ok: false,
				message: `Connected, but model "${this.model}" is not installed. Run: ollama pull ${this.model}`,
				models,
			};
		}
		return {
			ok: true,
			message: `Connected to Ollama (${models.length} model(s) available).`,
			models,
		};
	}

	async listModels(): Promise<ModelOption[]> {
		return normalizeModelIds(await this.listModelIds());
	}

	private async listModelIds(): Promise<string[]> {
		const { Ollama } = await import("ollama/browser");
		const client = new Ollama({
			host: this.url,
			fetch: this.fetchViaHttp(),
		});
		const response = await client.list();
		return (response.models ?? [])
			.map((m) => m.name)
			.filter((n): n is string => typeof n === "string");
	}

	async generateText(
		input: TextGenerationInput,
		signal?: AbortSignal
	): Promise<TextGenerationOutput> {
		return {
			text: await this.complete(input.prompt, input.responseFormat, signal),
		};
	}

	/** POST /api/generate (non-streaming) and return the raw model text. */
	private async complete(
		prompt: string,
		responseFormat: "text" | "json" = "text",
		signal?: AbortSignal
	): Promise<string> {
		let res;
		try {
			res = await this.http({
				url: `${this.url}/api/generate`,
				method: "POST",
				headers: { "Content-Type": "application/json" },
				signal,
				body: JSON.stringify({
					model: this.model,
					prompt,
					stream: false,
					...(responseFormat === "json" ? { format: "json" } : {}),
				}),
			});
		} catch (e) {
			if (signal?.aborted || isAbortError(e)) throw e;
			throw new ProviderError(
				"Ollama server unreachable. Check the URL and that Ollama is running."
			);
		}
		if (res.status < 200 || res.status >= 300) {
			throw new ProviderError(
				`Ollama request failed (HTTP ${res.status})${describeError(res.status)}: ${extractServerError(res)}`
			);
		}
		const body = res.json as { response?: string } | null;
		if (!body || typeof body.response !== "string") {
			throw new ProviderError("Ollama returned an unexpected response shape.");
		}
		return body.response;
	}

	private fetchViaHttp(): typeof fetch {
		return async (input: RequestInfo | URL, init?: RequestInit) => {
			const url =
				typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
			const headers: Record<string, string> = {};
			new Headers(init?.headers).forEach((value, key) => {
				headers[key] = value;
			});
			const res = await this.http({
				url,
				method: (init?.method as "GET" | "POST" | undefined) ?? "GET",
				body: (init?.body as string | undefined) ?? undefined,
				headers,
				signal: init?.signal ?? undefined,
			});
			return new Response(res.text, {
				status: res.status,
				headers:
					res.json && typeof res.json === "object"
						? { "content-type": "application/json" }
						: undefined,
			});
		};
	}
}
