import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
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
import type { ByokCloudProviderId, ByokModelOption } from "../types";

export type CloudObjectGenerator = <T>(opts: {
	schema: z.ZodType<T, z.ZodTypeDef, unknown>;
	prompt: string;
	signal?: AbortSignal;
}) => Promise<T>;

export type CloudTextGenerator = (opts: {
	prompt: string;
	signal?: AbortSignal;
}) => Promise<string>;

export interface OpenAiCompatibleProviderConfig {
	id: ByokCloudProviderId;
	label: string;
	vendor: string;
	apiKey: string;
	model: string;
	baseURL: string;
	fetchImpl: typeof fetch;
	generator?: CloudObjectGenerator;
	textGenerator?: CloudTextGenerator;
	listModelsImpl?: () => Promise<ByokModelOption[]>;
	normalizeModel?: (entry: OpenAiCompatibleModel) => ByokModelOption | null;
}

export interface OpenAiCompatibleModel {
	id?: string;
	name?: string;
	display_name?: string;
}

const DEFAULT_RATE_LIMIT_RETRIES = 2;
const DEFAULT_RATE_LIMIT_RETRY_MS = 1000;
const MAX_RATE_LIMIT_RETRY_MS = 10_000;
const SCHEMA_REPAIR_ATTEMPTS = 1;

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
	const direct = readErrorNumber(e, ["retryAfterMs", "retry_after_ms"]);
	if (direct !== null) return Math.max(0, direct);
	const seconds = readErrorNumber(e, ["retryAfter", "retry_after"]);
	if (seconds !== null) return Math.max(0, seconds * 1000);
	const headers = (e as { headers?: unknown }).headers;
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

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
	if (schema instanceof z.ZodObject) {
		const shape = schema.shape as Record<string, z.ZodType>;
		const properties: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(shape)) {
			properties[key] = zodToJsonSchema(value);
		}
		return { type: "object", properties, required: Object.keys(shape) };
	}
	if (schema instanceof z.ZodArray) {
		return { type: "array", items: zodToJsonSchema(schema.element as z.ZodType) };
	}
	if (schema instanceof z.ZodEnum) {
		return { type: "string", enum: schema.options as string[] };
	}
	if (schema instanceof z.ZodNullable) {
		const inner = zodToJsonSchema(schema.unwrap() as z.ZodType);
		return { ...inner, nullable: true };
	}
	if (schema instanceof z.ZodString) return { type: "string" };
	if (schema instanceof z.ZodNumber) return { type: "number" };
	if (schema instanceof z.ZodBoolean) return { type: "boolean" };
	return { type: "string" };
}

function stripJsonFence(text: string): string {
	return text
		.replace(/^```(?:json)?\s*\n?/i, "")
		.replace(/\n?```\s*$/, "")
		.trim();
}

function parseObjectResponse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, text: string): T {
	return schema.parse(JSON.parse(stripJsonFence(text)));
}

function extractText(body: ChatCompletion): string {
	const content: unknown = body.choices?.[0]?.message?.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part: { type?: string; text?: unknown }) =>
				part.type === "text" && typeof part.text === "string" ? part.text : ""
			)
			.join("");
	}
	throw new Error("OpenAI-compatible response did not include message content.");
}

function normalizeModel(entry: OpenAiCompatibleModel): ByokModelOption | null {
	const id = entry.id ?? "";
	if (!id.trim()) return null;
	return {
		id,
		label: entry.display_name ?? entry.name ?? id,
	};
}

export class OpenAiCompatibleProvider implements AiProvider {
	readonly id: ByokCloudProviderId;
	readonly label: string;
	readonly requiresNetwork = true;
	readonly requiresDownload = false;

	private readonly vendor: string;
	private readonly model: string;
	private readonly client: OpenAI;
	private readonly objectGenerator?: CloudObjectGenerator;
	private readonly textGenerator?: CloudTextGenerator;
	private readonly listModelsImpl?: () => Promise<ByokModelOption[]>;
	private readonly normalizeModel: (entry: OpenAiCompatibleModel) => ByokModelOption | null;

	constructor(config: OpenAiCompatibleProviderConfig) {
		this.id = config.id;
		this.label = config.label;
		this.vendor = config.vendor;
		this.model = config.model;
		this.client = new OpenAI({
			apiKey: config.apiKey,
			baseURL: config.baseURL,
			fetch: config.fetchImpl,
			maxRetries: 0,
			dangerouslyAllowBrowser: true,
		});
		this.objectGenerator = config.generator;
		this.textGenerator = config.textGenerator;
		this.listModelsImpl = config.listModelsImpl;
		this.normalizeModel = config.normalizeModel ?? normalizeModel;
	}

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

	private async runWithRetry<T>(
		run: (signal?: AbortSignal) => Promise<T>,
		signal?: AbortSignal
	): Promise<T> {
		let lastRateLimit: unknown = null;
		for (let attempt = 0; attempt <= DEFAULT_RATE_LIMIT_RETRIES; attempt++) {
			try {
				return await run(signal);
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
				await sleep(waitMs, signal);
			}
		}
		throw new ProviderRateLimitError(
			this.describeError(lastRateLimit),
			retryAfterMs(lastRateLimit)
		);
	}

	private async complete(input: { prompt: string }, signal?: AbortSignal): Promise<string> {
		if (this.textGenerator) {
			return this.textGenerator({ ...input, signal });
		}
		const body = await this.client.chat.completions.create(
			{
				model: this.model,
				messages: [{ role: "user", content: input.prompt }],
			},
			{ signal }
		);
		return extractText(body);
	}

	async testConnection(): Promise<ProviderStatus> {
		if (!this.model) {
			return { ok: false, message: `Choose a ${this.vendor} model.` };
		}
		try {
			await this.generateObject({
				schema: z.object({ ok: z.boolean() }),
				prompt: 'Reply with a JSON object {"ok": true}.',
			});
			return { ok: true, message: `Connected to ${this.vendor} (${this.model}).` };
		} catch (e) {
			return { ok: false, message: this.describeError(e) };
		}
	}

	async listModels(): Promise<ByokModelOption[]> {
		if (this.listModelsImpl) return this.listModelsImpl();
		const body = await this.client.models.list();
		return (body.data ?? [])
			.map((entry) => entry as OpenAiCompatibleModel)
			.map((entry) => this.normalizeModel(entry))
			.filter((entry): entry is ByokModelOption => entry !== null);
	}

	async generateText(
		input: TextGenerationInput,
		signal?: AbortSignal
	): Promise<TextGenerationOutput> {
		try {
			return {
				text: await this.runWithRetry(
					(runSignal) =>
						this.complete(
							{
								prompt: input.prompt,
							},
							runSignal
						),
					signal
				),
			};
		} catch (e) {
			if (e instanceof ProviderRateLimitError) throw e;
			throw new ProviderError(this.describeError(e));
		}
	}

	async generateObject<T>(input: ObjectGenerationInput<T>, signal?: AbortSignal): Promise<T> {
		try {
			return await this.runWithRetry(async (runSignal) => {
				if (this.objectGenerator) {
					return this.objectGenerator({
						schema: input.schema,
						prompt: input.prompt,
						signal: runSignal,
					});
				}
				const schemaJson = JSON.stringify(zodToJsonSchema(input.schema));
				const basePrompt =
					`${input.prompt}\n\nRespond with ONLY a valid JSON object matching this schema ` +
					`(no markdown fences, no extra text). Include every required property; use null only ` +
					`when the schema allows nullable:\n${schemaJson}`;
				let prompt = basePrompt;
				let lastError: unknown = null;
				for (let attempt = 0; attempt <= SCHEMA_REPAIR_ATTEMPTS; attempt++) {
					const text = await this.complete({ prompt }, runSignal);
					try {
						return parseObjectResponse(input.schema, text);
					} catch (e) {
						lastError = e;
						prompt =
							`${basePrompt}\n\nYour previous response did not match the schema. ` +
							`Validation error: ${errorMessage(e)}\nPrevious response:\n${text}\n\n` +
							`Return ONLY a corrected JSON object.`;
					}
				}
				throw lastError;
			}, signal);
		} catch (e) {
			if (e instanceof ProviderRateLimitError) throw e;
			throw new ProviderError(this.describeError(e));
		}
	}
}
