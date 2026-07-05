import { AnthropicProvider } from "./anthropic-provider";
import { GoogleProvider } from "./google-provider";
import { OllamaProvider } from "./ollama-provider";
import { OpenAIProvider } from "./openai-provider";
import { OpenRouterProvider } from "./openrouter-provider";
import { XaiProvider } from "./xai-provider";
import { normalizeOllamaUrl, resolveByokFetchDeps, resolveOllamaDeps } from "./default-deps";
import type { ByokCoreProviderConfig, ByokProviderDeps, ByokProviderRuntime } from "../types";

export function createByokProvider(
	config: ByokCoreProviderConfig,
	deps?: Partial<ByokProviderDeps>
): ByokProviderRuntime {
	switch (config.provider) {
		case "anthropic": {
			const { fetchImpl } = resolveByokFetchDeps(deps);
			return new AnthropicProvider({
				apiKey: config.apiKey,
				model: config.model,
				fetchImpl,
			}) as unknown as ByokProviderRuntime;
		}
		case "openai": {
			const { fetchImpl } = resolveByokFetchDeps(deps);
			return new OpenAIProvider({
				apiKey: config.apiKey,
				model: config.model,
				fetchImpl,
			}) as unknown as ByokProviderRuntime;
		}
		case "google": {
			const { fetchImpl } = resolveByokFetchDeps(deps);
			return new GoogleProvider({
				apiKey: config.apiKey,
				model: config.model,
				fetchImpl,
			}) as unknown as ByokProviderRuntime;
		}
		case "xai": {
			const { fetchImpl } = resolveByokFetchDeps(deps);
			return new XaiProvider({
				apiKey: config.apiKey,
				model: config.model,
				fetchImpl,
			}) as unknown as ByokProviderRuntime;
		}
		case "openrouter": {
			const { fetchImpl } = resolveByokFetchDeps(deps);
			return new OpenRouterProvider({
				apiKey: config.apiKey,
				model: config.model,
				fetchImpl,
			}) as unknown as ByokProviderRuntime;
		}
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
