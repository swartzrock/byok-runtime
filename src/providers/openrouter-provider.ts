import { createOpenAI } from "@ai-sdk/openai";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import { generateText as generateAiText } from "ai";
import { z } from "zod/v3";
import {
	AiSdkProvider,
	type ObjectGenerator,
	textGenerator,
	type TextGenerator,
} from "./ai-sdk-provider";
import type { ModelOption } from "../models/model-options";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

interface OpenRouterRawModel {
	id?: string;
	name?: string;
}

export interface OpenRouterProviderOptions {
	apiKey: string;
	model: string;
	/** Custom fetch supplied by the host app. */
	fetchImpl?: FetchFunction;
	/** Overrides the real AI SDK call in tests. */
	generator?: ObjectGenerator;
	textGenerator?: TextGenerator;
	/** Overrides the model-list call in tests. */
	listModelsImpl?: () => Promise<ModelOption[]>;
}

export class OpenRouterProvider extends AiSdkProvider {
	constructor(opts: OpenRouterProviderOptions) {
		super({
			id: "openrouter",
			label: "OpenRouter",
			vendor: "OpenRouter",
			model: opts.model,
			generateObject: opts.generator ?? defaultGenerator(opts.apiKey, opts.model, opts.fetchImpl),
			generateText:
				opts.textGenerator ?? defaultTextGenerator(opts.apiKey, opts.model, opts.fetchImpl),
			listModels:
				opts.listModelsImpl ?? (() => listOpenRouterModelOptions(opts.apiKey, opts.fetchImpl)),
		});
	}
}

function normalizeOpenRouterModel(entry: OpenRouterRawModel): ModelOption {
	const id = entry.id ?? "";
	return {
		id,
		label: entry.name ?? id,
	};
}

async function listOpenRouterModelOptions(
	apiKey: string,
	fetchImpl?: FetchFunction
): Promise<ModelOption[]> {
	const fetchFn = (fetchImpl ?? globalThis.fetch) as typeof fetch | undefined;
	if (!fetchFn) {
		throw new Error("OpenRouter model fetch requires a fetch implementation.");
	}
	const response = await fetchFn(`${OPENROUTER_BASE_URL}/models`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
	});
	if (!response.ok) {
		const detail = (await response.text()).trim();
		throw new Error(
			detail
				? `OpenRouter model fetch failed (${response.status}): ${detail}`
				: `OpenRouter model fetch failed (${response.status}).`
		);
	}
	const body = (await response.json()) as { data?: OpenRouterRawModel[] };
	return (body.data ?? [])
		.filter((entry) => typeof entry.id === "string" && entry.id.trim().length > 0)
		.map(normalizeOpenRouterModel);
}

function defaultGenerator(
	apiKey: string,
	modelId: string,
	fetchImpl?: FetchFunction
): ObjectGenerator {
	const openrouter = createOpenAI({
		apiKey,
		baseURL: OPENROUTER_BASE_URL,
		fetch: fetchImpl,
		name: "openrouter",
	});
	const model = openrouter.chat(modelId);
	return async function generate<T>({
		schema,
		prompt,
		signal,
	}: {
		schema: z.ZodType<T, z.ZodTypeDef, unknown>;
		prompt: string;
		signal?: AbortSignal;
	}): Promise<T> {
		const jsonPrompt =
			`${prompt}\n\nRespond with ONLY a valid JSON object matching this schema ` +
			`(no markdown fences, no extra text):\n${JSON.stringify(zodToJsonSchema(schema))}`;
		const { text } = await generateAiText({
			model,
			prompt: jsonPrompt,
			abortSignal: signal,
		});
		const cleaned = text
			.replace(/^```(?:json)?\s*\n?/i, "")
			.replace(/\n?```\s*$/, "")
			.trim();
		return schema.parse(JSON.parse(cleaned));
	};
}

function defaultTextGenerator(
	apiKey: string,
	modelId: string,
	fetchImpl?: FetchFunction
): TextGenerator {
	const openrouter = createOpenAI({
		apiKey,
		baseURL: OPENROUTER_BASE_URL,
		fetch: fetchImpl,
		name: "openrouter",
	});
	return textGenerator(openrouter.chat(modelId));
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
	if (schema instanceof z.ZodString) {
		return { type: "string" };
	}
	if (schema instanceof z.ZodNumber) {
		return { type: "number" };
	}
	if (schema instanceof z.ZodBoolean) {
		return { type: "boolean" };
	}
	return { type: "string" };
}
