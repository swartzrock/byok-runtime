import { OllamaProvider } from "./ollama-provider";
import {
	normalizeLmStudioBaseUrl,
	normalizeOllamaUrl,
	resolveByokFetchDeps,
	resolveOllamaDeps,
} from "./default-deps";
import { OpenAiCompatibleProvider, type OpenAiCompatibleModel } from "./openai-compatible-provider";
import { BYOK_CLOUD_PROVIDER_MANIFEST, isCloudProviderId } from "../provider-manifest";
import type {
	ByokCloudProviderId,
	ByokCoreProviderConfig,
	ByokLmStudioProviderConfig,
	ByokModelOption,
	ByokProviderDeps,
	ByokProviderRuntime,
} from "../types";

function requestHeaders(
	auth: "bearer" | "anthropic-api-key"
): ((apiKey: string) => Record<string, string>) | undefined {
	switch (auth) {
		case "bearer":
			return undefined;
		case "anthropic-api-key":
			return (apiKey) => ({
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
			});
	}
}

function normalizeModel(
	strategy: "default" | "name-fallback"
): ((entry: OpenAiCompatibleModel) => ByokModelOption | null) | undefined {
	switch (strategy) {
		case "default":
			return undefined;
		case "name-fallback":
			return (entry) => {
				const id = entry.id ?? "";
				return id.trim() ? { id, label: entry.name ?? id } : null;
			};
	}
}

const LM_STUDIO_API_KEY = "lm-studio";

function isCloudProviderConfig(
	config: ByokCoreProviderConfig
): config is Extract<ByokCoreProviderConfig, { provider: ByokCloudProviderId }> {
	return isCloudProviderId(config.provider);
}

function createCloudProvider(
	config: Extract<ByokCoreProviderConfig, { provider: ByokCloudProviderId }>,
	deps?: Partial<ByokProviderDeps>
): ByokProviderRuntime {
	const { fetchImpl } = resolveByokFetchDeps(deps);
	const { definition, runtime } = BYOK_CLOUD_PROVIDER_MANIFEST[config.provider];
	return new OpenAiCompatibleProvider({
		id: config.provider,
		label: definition.label,
		vendor: definition.vendor,
		baseURL: runtime.baseURL,
		apiKey: config.apiKey,
		model: config.model,
		fetchImpl,
		requestHeaders: requestHeaders(runtime.auth),
		normalizeModel: normalizeModel(runtime.modelNormalization),
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
	if (isCloudProviderConfig(config)) {
		return createCloudProvider(config, deps);
	}

	switch (config.provider) {
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
