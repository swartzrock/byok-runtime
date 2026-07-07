import { createByokProvider } from "./providers/provider-factory";
import { resolveByokCloudProviderConfig } from "./credentials";
import type {
	ByokClient,
	ByokClientConfig,
	ByokClientTextGenerationInput,
	ByokCoreProviderConfig,
	ByokFacadeDeps,
	ByokGenerateTextOptions,
	ByokListModelsOptions,
	ByokModelOption,
	ByokTextGenerationOutput,
} from "./types";

const MODEL_NOT_REQUIRED_FOR_LISTING = "";

function providerConfigFromGenerateTextOptions(
	options: ByokGenerateTextOptions
): ByokCoreProviderConfig {
	if (options.provider === "ollama") {
		return {
			provider: "ollama",
			url: options.url,
			model: options.model,
		};
	}
	if (options.provider === "lm-studio") {
		return {
			provider: "lm-studio",
			url: options.url,
			model: options.model,
		};
	}
	return resolveByokCloudProviderConfig(options);
}

function providerConfigFromClientInput(
	config: ByokClientConfig,
	input: ByokClientTextGenerationInput
): ByokCoreProviderConfig {
	if (config.provider === "ollama") {
		return {
			provider: "ollama",
			url: config.url,
			model: input.model,
		};
	}
	if (config.provider === "lm-studio") {
		return {
			provider: "lm-studio",
			url: config.url,
			model: input.model,
		};
	}
	return resolveByokCloudProviderConfig({ ...config, model: input.model });
}

function providerConfigFromListModelsOptions(
	options: ByokListModelsOptions
): ByokCoreProviderConfig {
	if (options.provider === "ollama") {
		return {
			provider: "ollama",
			url: options.url,
			model: MODEL_NOT_REQUIRED_FOR_LISTING,
		};
	}
	if (options.provider === "lm-studio") {
		return {
			provider: "lm-studio",
			url: options.url,
			model: MODEL_NOT_REQUIRED_FOR_LISTING,
		};
	}
	return resolveByokCloudProviderConfig({ ...options, model: MODEL_NOT_REQUIRED_FOR_LISTING });
}

async function generateTextForConfig(
	config: ByokCoreProviderConfig,
	input: { prompt: string },
	options: {
		deps?: ByokFacadeDeps;
		signal?: AbortSignal;
	} = {}
): Promise<ByokTextGenerationOutput> {
	const provider = createByokProvider(config, options.deps);
	return provider.generateText({ prompt: input.prompt }, options.signal);
}

export async function generateText(
	options: ByokGenerateTextOptions
): Promise<ByokTextGenerationOutput> {
	return generateTextForConfig(providerConfigFromGenerateTextOptions(options), options, {
		deps: options.deps,
		signal: options.signal,
	});
}

export async function listModels(options: ByokListModelsOptions): Promise<ByokModelOption[]> {
	const provider = createByokProvider(providerConfigFromListModelsOptions(options), options.deps);
	return provider.listModels();
}

export function createByok(config: ByokClientConfig): ByokClient {
	return {
		generateText(input) {
			return generateTextForConfig(providerConfigFromClientInput(config, input), input, {
				deps: config.deps,
				signal: input.signal,
			});
		},
	};
}
