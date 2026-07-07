import { OllamaProvider } from "./ollama-provider";
import {
	normalizeLmStudioBaseUrl,
	normalizeOllamaUrl,
	resolveByokFetchDeps,
	resolveOllamaDeps,
} from "./default-deps";
import { OpenAiCompatibleProvider, type OpenAiCompatibleModel } from "./openai-compatible-provider";
import type {
	ByokCloudProviderId,
	ByokCoreProviderConfig,
	ByokLmStudioProviderConfig,
	ByokModelOption,
	ByokProviderDeps,
	ByokProviderRuntime,
} from "../types";

interface CloudProviderMetadata {
	label: string;
	vendor: string;
	baseURL: string;
	requestHeaders?: (apiKey: string) => Record<string, string>;
	normalizeModel?: (entry: OpenAiCompatibleModel) => ByokModelOption | null;
}

const CLOUD_PROVIDER_METADATA: Record<ByokCloudProviderId, CloudProviderMetadata> = {
	anthropic: {
		label: "Anthropic (Claude)",
		vendor: "Anthropic",
		baseURL: "https://api.anthropic.com/v1",
		requestHeaders: (apiKey) => ({
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
		}),
	},
	openai: {
		label: "OpenAI (ChatGPT)",
		vendor: "OpenAI",
		baseURL: "https://api.openai.com/v1",
	},
	google: {
		label: "Google (Gemini)",
		vendor: "Google",
		baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
	},
	xai: {
		label: "xAI (Grok)",
		vendor: "xAI",
		baseURL: "https://api.x.ai/v1",
	},
	openrouter: {
		label: "OpenRouter",
		vendor: "OpenRouter",
		baseURL: "https://openrouter.ai/api/v1",
		normalizeModel: (entry) => {
			const id = entry.id ?? "";
			if (!id.trim()) return null;
			return {
				id,
				label: entry.name ?? id,
			};
		},
	},
};

const LM_STUDIO_API_KEY = "lm-studio";

function createCloudProvider(
	config: Extract<ByokCoreProviderConfig, { provider: ByokCloudProviderId }>,
	deps?: Partial<ByokProviderDeps>
): ByokProviderRuntime {
	const { fetchImpl } = resolveByokFetchDeps(deps);
	const metadata = CLOUD_PROVIDER_METADATA[config.provider];
	return new OpenAiCompatibleProvider({
		id: config.provider,
		apiKey: config.apiKey,
		model: config.model,
		fetchImpl,
		...metadata,
	});
}

function createLmStudioProvider(
	config: ByokLmStudioProviderConfig,
	deps?: Partial<ByokProviderDeps>
): ByokProviderRuntime {
	const { fetchImpl } = resolveByokFetchDeps(deps);
	return new OpenAiCompatibleProvider({
		id: config.provider,
		label: "LM Studio",
		vendor: "LM Studio",
		apiKey: LM_STUDIO_API_KEY,
		model: config.model,
		baseURL: normalizeLmStudioBaseUrl(config.url),
		fetchImpl,
		requiresNetwork: false,
	});
}

export function createByokProvider(
	config: ByokCoreProviderConfig,
	deps?: Partial<ByokProviderDeps>
): ByokProviderRuntime {
	switch (config.provider) {
		case "anthropic":
		case "openai":
		case "google":
		case "xai":
		case "openrouter":
			return createCloudProvider(config, deps);
		case "lm-studio":
			return createLmStudioProvider(config, deps);
		case "ollama": {
			const { http } = resolveOllamaDeps(deps);
			return new OllamaProvider({
				url: normalizeOllamaUrl(config.url),
				model: config.model,
				http,
			});
		}
	}
}
