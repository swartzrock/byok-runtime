import { createByokProvider } from "./providers/provider-factory";
import { resolveByokCloudProviderConfig } from "./credentials";
import type {
	ByokClientConfig,
	ByokClientTextGenerationInput,
	ByokStreamingClient,
	ByokCoreProviderConfig,
	ByokFacadeDeps,
	ByokGenerateTextOptions,
	ByokListModelsOptions,
	ByokModelOption,
	ByokTextGenerationInput,
	ByokTextGenerationOutput,
	ByokStreamTextOptions,
	ByokTextStream,
} from "./types";
import { createBufferedTextStream } from "./text-stream";

const MODEL_NOT_REQUIRED_FOR_LISTING = "";

function providerTextInput(
	input: Pick<ByokTextGenerationInput, "prompt" | "instructions">
): ByokTextGenerationInput {
	return {
		prompt: input.prompt,
		...(input.instructions === undefined ? {} : { instructions: input.instructions }),
	};
}

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
	input: Pick<ByokTextGenerationInput, "prompt" | "instructions">,
	options: {
		deps?: ByokFacadeDeps;
		signal?: AbortSignal;
	} = {}
): Promise<ByokTextGenerationOutput> {
	const provider = createByokProvider(config, options.deps);
	return provider.generateText(providerTextInput(input), options.signal);
}

function streamTextForConfig(
	config: ByokCoreProviderConfig,
	input: Pick<ByokTextGenerationInput, "prompt" | "instructions">,
	options: {
		deps?: ByokFacadeDeps;
		signal?: AbortSignal;
	} = {}
): ByokTextStream {
	const provider = createByokProvider(config, options.deps);
	const generationInput = providerTextInput(input);
	return (
		provider.streamText?.(generationInput, options.signal) ??
		createBufferedTextStream(
			(signal) => provider.generateText(generationInput, signal),
			options.signal
		)
	);
}

export async function generateText(
	options: ByokGenerateTextOptions
): Promise<ByokTextGenerationOutput> {
	return generateTextForConfig(providerConfigFromGenerateTextOptions(options), options, {
		deps: options.deps,
		signal: options.signal,
	});
}

export function streamText(options: ByokStreamTextOptions): ByokTextStream {
	return streamTextForConfig(providerConfigFromGenerateTextOptions(options), options, {
		deps: options.deps,
		signal: options.signal,
	});
}

export async function listModels(options: ByokListModelsOptions): Promise<ByokModelOption[]> {
	const provider = createByokProvider(providerConfigFromListModelsOptions(options), options.deps);
	return provider.listModels();
}

export function createByok(config: ByokClientConfig): ByokStreamingClient {
	return {
		generateText(input) {
			return generateTextForConfig(providerConfigFromClientInput(config, input), input, {
				deps: config.deps,
				signal: input.signal,
			});
		},
		streamText(input) {
			return streamTextForConfig(providerConfigFromClientInput(config, input), input, {
				deps: config.deps,
				signal: input.signal,
			});
		},
	};
}
