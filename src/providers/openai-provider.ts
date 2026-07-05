import { createOpenAI } from "@ai-sdk/openai";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import type { Model as OpenAIModel } from "openai/resources/models";
import {
	AiSdkProvider,
	modelGenerator,
	textGenerator,
	type ObjectGenerator,
	type TextGenerator,
} from "./ai-sdk-provider";
import { normalizeModelIds, type ModelOption } from "../models/model-options";

export interface OpenAIProviderOptions {
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

export class OpenAIProvider extends AiSdkProvider {
	constructor(opts: OpenAIProviderOptions) {
		super({
			id: "openai",
			label: "OpenAI (ChatGPT)",
			vendor: "OpenAI",
			model: opts.model,
			generateObject: opts.generator ?? defaultGenerator(opts.apiKey, opts.model, opts.fetchImpl),
			generateText:
				opts.textGenerator ??
				defaultTextGenerator(opts.apiKey, opts.model, opts.fetchImpl),
			listModels:
				opts.listModelsImpl ??
				(async () => normalizeModelIds(await listOpenAiModels(opts.apiKey, opts.fetchImpl))),
		});
	}
}

async function listOpenAiModels(
	apiKey: string,
	fetchImpl?: FetchFunction
): Promise<string[]> {
	const fetchFn = (fetchImpl ?? globalThis.fetch) as typeof fetch | undefined;
	if (!fetchFn) {
		throw new Error("OpenAI model fetch requires a fetch implementation.");
	}
	const response = await fetchFn("https://api.openai.com/v1/models", {
		method: "GET",
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
	});
	if (!response.ok) {
		const detail = (await response.text()).trim();
		throw new Error(
			detail
				? `OpenAI model fetch failed (${response.status}): ${detail}`
				: `OpenAI model fetch failed (${response.status}).`
		);
	}
	const body = (await response.json()) as { data?: OpenAIModel[] };
	return (body.data ?? [])
		.map((model) => model.id)
		.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

function defaultGenerator(
	apiKey: string,
	model: string,
	fetchImpl?: FetchFunction
): ObjectGenerator {
	const openai = createOpenAI({ apiKey, fetch: fetchImpl });
	return modelGenerator(openai(model));
}

function defaultTextGenerator(
	apiKey: string,
	model: string,
	fetchImpl?: FetchFunction
): TextGenerator {
	const openai = createOpenAI({ apiKey, fetch: fetchImpl });
	return textGenerator(openai(model));
}
