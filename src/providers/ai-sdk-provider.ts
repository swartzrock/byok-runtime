import {
	generateObject as generateAiObject,
	generateText as generateAiText,
	type LanguageModel,
	type Schema,
	zodSchema,
} from "ai";
import { z } from "zod/v3";
import {
	type AiProvider,
	type ObjectGenerationInput,
	ProviderError,
	ProviderRateLimitError,
	type ProviderStatus,
	type TextGenerationInput,
	type TextGenerationOutput,
} from "./types";
import type { ByokModelOption } from "../types";

/** Injectable structured-output call so the provider can be unit-tested. */
export type ObjectGenerator = <T>(opts: {
	schema: z.ZodType<T, z.ZodTypeDef, unknown>;
	prompt: string;
	signal?: AbortSignal;
}) => Promise<T>;

/** Injectable text-generation call so providers can be unit-tested. */
export type TextGenerator = (opts: { prompt: string; signal?: AbortSignal }) => Promise<string>;

export const DEFAULT_RATE_LIMIT_RETRIES = 2;
const DEFAULT_RATE_LIMIT_RETRY_MS = 1000;
const MAX_RATE_LIMIT_RETRY_MS = 10_000;

export interface AiSdkProviderConfig {
	/** Stable provider id (e.g. "openai"). */
	id: string;
	/** Human label shown in settings (e.g. "OpenAI (ChatGPT)"). */
	label: string;
	/** Vendor name used in user-facing error/status messages (e.g. "OpenAI"). */
	vendor: string;
	model: string;
	/** Structured-output call; the real one wraps the AI SDK, tests inject a mock. */
	generateObject: ObjectGenerator;
	/** Text-generation call; the real one wraps the AI SDK, tests inject a mock. */
	generateText: TextGenerator;
	/** Model-list call for provider setup flows. */
	listModels: () => Promise<ByokModelOption[]>;
}

function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

function readErrorNumber(e: unknown, keys: string[]): number | null {
	if (!e || typeof e !== "object") return null;
	const record = e as Record<string, unknown>;
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "number" && Number.isFinite(value)) return value;
		if (typeof value === "string") {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return parsed;
		}
	}
	return null;
}

function retryAfterMs(e: unknown): number | null {
	if (!e || typeof e !== "object") return null;
	const record = e as Record<string, unknown>;
	const direct = readErrorNumber(e, ["retryAfterMs", "retry_after_ms"]);
	if (direct !== null) return Math.max(0, direct);
	const seconds = readErrorNumber(e, ["retryAfter", "retry_after"]);
	if (seconds !== null) return Math.max(0, seconds * 1000);
	const headers = record.headers;
	if (headers && typeof (headers as Headers).get === "function") {
		const raw = (headers as Headers).get("retry-after");
		if (raw) {
			const numeric = Number(raw);
			if (Number.isFinite(numeric)) return Math.max(0, numeric * 1000);
			const dateMs = Date.parse(raw);
			if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
		}
	}
	return null;
}

function isRateLimitError(e: unknown): boolean {
	const status = readErrorNumber(e, ["status", "statusCode", "code"]);
	return status === 429 || /429|rate.?limit|quota/i.test(errorMessage(e));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DOMException("Aborted", "AbortError"));
			return;
		}
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(new DOMException("Aborted", "AbortError"));
			},
			{ once: true }
		);
	});
}

/**
 * One provider implementation shared by every Vercel AI SDK vendor (Anthropic,
 * OpenAI, Google, xAI). They differ only in which model factory builds the
 * structured-output call, so the prompts, validation and error mapping live
 * here and each vendor subclass just supplies its `generate`.
 */
export class AiSdkProvider implements AiProvider {
	readonly id: string;
	readonly label: string;
	readonly requiresNetwork = true;
	readonly requiresDownload = false;

	protected readonly vendor: string;
	protected readonly model: string;
	private readonly objectGenerator: ObjectGenerator;
	private readonly textGenerator: TextGenerator;
	private readonly listModelsImpl: () => Promise<ByokModelOption[]>;

	constructor(config: AiSdkProviderConfig) {
		this.id = config.id;
		this.label = config.label;
		this.vendor = config.vendor;
		this.model = config.model;
		this.objectGenerator = config.generateObject;
		this.textGenerator = config.generateText;
		this.listModelsImpl = config.listModels;
	}

	/** Map AI SDK / network errors to user-readable provider errors. */
	protected describeError(e: unknown): string {
		const msg = errorMessage(e);
		if (/api[\s_-]?key|authenticat|401|403/i.test(msg)) {
			return `${this.vendor} rejected the API key. Check the API key supplied by the host app.`;
		}
		if (/429|rate.?limit|quota/i.test(msg)) {
			return `${this.vendor} rate limit hit. Wait a moment and try again.`;
		}
		if (/network|fetch|ENOTFOUND|ECONN|timeout/i.test(msg)) {
			return `Could not reach ${this.vendor}. Check your connection.`;
		}
		return `${this.vendor} request failed: ${msg}`;
	}

	private async generateObjectWithRetry<T>(opts: {
		schema: z.ZodType<T, z.ZodTypeDef, unknown>;
		prompt: string;
		signal?: AbortSignal;
	}): Promise<T> {
		let lastRateLimit: unknown = null;
		for (let attempt = 0; attempt <= DEFAULT_RATE_LIMIT_RETRIES; attempt++) {
			try {
				return await this.objectGenerator(opts);
			} catch (e) {
				if (!isRateLimitError(e) || attempt === DEFAULT_RATE_LIMIT_RETRIES) {
					if (isRateLimitError(e)) {
						throw new ProviderRateLimitError(this.describeError(e), retryAfterMs(e));
					}
					throw e;
				}
				lastRateLimit = e;
				const waitMs = Math.min(
					retryAfterMs(e) ?? DEFAULT_RATE_LIMIT_RETRY_MS * 2 ** attempt,
					MAX_RATE_LIMIT_RETRY_MS
				);
				await sleep(waitMs, opts.signal);
			}
		}
		throw new ProviderRateLimitError(
			this.describeError(lastRateLimit),
			retryAfterMs(lastRateLimit)
		);
	}

	private async generateTextWithRetry(opts: {
		prompt: string;
		signal?: AbortSignal;
	}): Promise<string> {
		let lastRateLimit: unknown = null;
		for (let attempt = 0; attempt <= DEFAULT_RATE_LIMIT_RETRIES; attempt++) {
			try {
				return await this.textGenerator(opts);
			} catch (e) {
				if (!isRateLimitError(e) || attempt === DEFAULT_RATE_LIMIT_RETRIES) {
					if (isRateLimitError(e)) {
						throw new ProviderRateLimitError(this.describeError(e), retryAfterMs(e));
					}
					throw e;
				}
				lastRateLimit = e;
				const waitMs = Math.min(
					retryAfterMs(e) ?? DEFAULT_RATE_LIMIT_RETRY_MS * 2 ** attempt,
					MAX_RATE_LIMIT_RETRY_MS
				);
				await sleep(waitMs, opts.signal);
			}
		}
		throw new ProviderRateLimitError(
			this.describeError(lastRateLimit),
			retryAfterMs(lastRateLimit)
		);
	}

	async testConnection(): Promise<ProviderStatus> {
		if (!this.model) {
			return { ok: false, message: `Choose a ${this.vendor} model.` };
		}
		try {
			await this.generateObjectWithRetry({
				schema: z.object({ ok: z.boolean() }),
				prompt: 'Reply with a JSON object {"ok": true}.',
			});
			return { ok: true, message: `Connected to ${this.vendor} (${this.model}).` };
		} catch (e) {
			return { ok: false, message: this.describeError(e) };
		}
	}

	async listModels(): Promise<ByokModelOption[]> {
		return this.listModelsImpl();
	}

	async generateText(
		input: TextGenerationInput,
		signal?: AbortSignal
	): Promise<TextGenerationOutput> {
		try {
			return {
				text: await this.generateTextWithRetry({
					prompt: input.prompt,
					signal,
				}),
			};
		} catch (e) {
			if (e instanceof ProviderRateLimitError) throw e;
			throw new ProviderError(this.describeError(e));
		}
	}

	async generateObject<T>(input: ObjectGenerationInput<T>, signal?: AbortSignal): Promise<T> {
		try {
			return await this.generateObjectWithRetry({
				schema: input.schema,
				prompt: input.prompt,
				signal,
			});
		} catch (e) {
			if (e instanceof ProviderRateLimitError) throw e;
			throw new ProviderError(this.describeError(e));
		}
	}
}

/** Build the real AI SDK structured-output caller for a resolved model. */
export function modelGenerator(model: LanguageModel): ObjectGenerator {
	return async function generate<T>({
		schema,
		prompt,
		signal,
	}: {
		schema: z.ZodType<T, z.ZodTypeDef, unknown>;
		prompt: string;
		signal?: AbortSignal;
	}): Promise<T> {
		const sdkSchema: Schema<T> = zodSchema<T>(schema);
		const { object } = await generateAiObject<Schema<T>, "object", T>({
			model,
			schema: sdkSchema,
			prompt,
			output: "object",
			abortSignal: signal,
		});
		return object;
	};
}

/** Build the real AI SDK text caller for a resolved model. */
export function textGenerator(model: LanguageModel): TextGenerator {
	return async function generate({ prompt, signal }): Promise<string> {
		const { text } = await generateAiText({
			model,
			prompt,
			abortSignal: signal,
		});
		return text;
	};
}
