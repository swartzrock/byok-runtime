import { createXai } from "@ai-sdk/xai";
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

export interface XaiProviderOptions {
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

export class XaiProvider extends AiSdkProvider {
	constructor(opts: XaiProviderOptions) {
		super({
			id: "xai",
			label: "xAI (Grok)",
			vendor: "xAI",
			model: opts.model,
			generateObject: opts.generator ?? defaultGenerator(opts.apiKey, opts.model, opts.fetchImpl),
			generateText:
				opts.textGenerator ??
				defaultTextGenerator(opts.apiKey, opts.model, opts.fetchImpl),
			listModels:
				opts.listModelsImpl ??
				(async () => normalizeModelIds(await listXaiModels(opts.apiKey, opts.fetchImpl))),
		});
	}
}

async function listXaiModels(
	apiKey: string,
	fetchImpl?: FetchFunction
): Promise<string[]> {
	const { default: OpenAI } = await import("openai");
	const client = new OpenAI({
		apiKey,
		baseURL: "https://api.x.ai/v1",
		fetch: fetchImpl as typeof fetch | undefined,
		dangerouslyAllowBrowser: true,
	});
	const page = await client.models.list();
	return (page.data as OpenAIModel[] | undefined ?? [])
		.map((model) => model.id)
		.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

function defaultGenerator(
	apiKey: string,
	model: string,
	fetchImpl?: FetchFunction
): ObjectGenerator {
	const xai = createXai({ apiKey, fetch: fetchImpl });
	return modelGenerator(xai(model));
}

function defaultTextGenerator(
	apiKey: string,
	model: string,
	fetchImpl?: FetchFunction
): TextGenerator {
	const xai = createXai({ apiKey, fetch: fetchImpl });
	return textGenerator(xai(model));
}
