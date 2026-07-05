import Anthropic from "@anthropic-ai/sdk";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import {
	AiSdkProvider,
	modelGenerator,
	textGenerator,
	type ObjectGenerator,
	type TextGenerator,
} from "./ai-sdk-provider";
import { anthropicModelInfoToByokModelOption } from "../models/anthropic-models";
import type { ByokModelOption } from "../types";

export type { ObjectGenerator } from "./ai-sdk-provider";

export interface AnthropicProviderOptions {
	apiKey: string;
	model: string;
	/** Custom fetch supplied by the host app. */
	fetchImpl?: FetchFunction;
	/** Overrides the real AI SDK call in tests. */
	generator?: ObjectGenerator;
	textGenerator?: TextGenerator;
}

export class AnthropicProvider extends AiSdkProvider {
	constructor(opts: AnthropicProviderOptions) {
		super({
			id: "anthropic",
			label: "Anthropic (Claude)",
			vendor: "Anthropic",
			model: opts.model,
			generateObject: opts.generator ?? defaultGenerator(opts.apiKey, opts.model, opts.fetchImpl),
			generateText:
				opts.textGenerator ?? defaultTextGenerator(opts.apiKey, opts.model, opts.fetchImpl),
			listModels: () => listAnthropicModelOptions(opts.apiKey, opts.fetchImpl),
		});
	}
}

async function listAnthropicModelOptions(
	apiKey: string,
	fetchImpl?: FetchFunction
): Promise<ByokModelOption[]> {
	const client = new Anthropic({
		apiKey,
		fetch: fetchImpl,
		dangerouslyAllowBrowser: true,
	});
	const models: ByokModelOption[] = [];

	for await (const model of client.models.list()) {
		models.push(anthropicModelInfoToByokModelOption(model));
	}
	return models;
}

/** Build the real AI SDK structured-output caller for a given key/model. */
function defaultGenerator(
	apiKey: string,
	model: string,
	fetchImpl?: FetchFunction
): ObjectGenerator {
	const anthropic = createAnthropic({ apiKey, fetch: fetchImpl });
	return modelGenerator(anthropic(model));
}

function defaultTextGenerator(
	apiKey: string,
	model: string,
	fetchImpl?: FetchFunction
): TextGenerator {
	const anthropic = createAnthropic({ apiKey, fetch: fetchImpl });
	return textGenerator(anthropic(model));
}
