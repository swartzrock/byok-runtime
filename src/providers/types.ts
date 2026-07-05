import type { z } from "zod/v3";
export {
	ByokProviderError as ProviderError,
	ByokProviderRateLimitError as ProviderRateLimitError,
} from "../types";
import type { ByokModelOption } from "../types";

/** Minimal HTTP abstraction so providers can be unit-tested without a live server. */
export interface HttpRequest {
	url: string;
	method: "GET" | "POST";
	body?: string;
	headers?: Record<string, string>;
	signal?: AbortSignal;
}

export interface HttpResponse {
	status: number;
	text: string;
	json: unknown;
}

export type HttpClient = (req: HttpRequest) => Promise<HttpResponse>;

export interface ProviderStatus {
	ok: boolean;
	message: string;
	models?: string[];
}

export interface TextGenerationInput {
	prompt: string;
	/** Ask providers with native support to constrain the response to JSON text. */
	responseFormat?: "text" | "json";
	/** Optional JSON schema for providers that support structured text output. */
	jsonSchema?: string;
}

export interface TextGenerationOutput {
	text: string;
}

export interface ObjectGenerationInput<T> {
	prompt: string;
	schema: z.ZodType<T, z.ZodTypeDef, unknown>;
}

/**
 * Shared provider interface. v1.0 implements only Ollama, but the full shape
 * ships now so adding OpenAI / Claude Code / Local VM later is additive.
 */
export interface AiProvider {
	id: string;
	label: string;
	requiresNetwork: boolean;
	requiresDownload: boolean;
	sectionConcurrencyLimit?: number;
	testConnection(): Promise<ProviderStatus>;
	listModels(): Promise<ByokModelOption[]>;
	generateText(
		input: TextGenerationInput,
		signal?: AbortSignal
	): Promise<TextGenerationOutput>;
	generateObject?<T>(
		input: ObjectGenerationInput<T>,
		signal?: AbortSignal
	): Promise<T>;
}
