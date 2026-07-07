import {
	ByokProviderError,
	type ByokApiKeyCloudProviderConfig,
	type ByokCloudProviderConfig,
	type ByokCloudProviderId,
	type ByokEnvCredential,
} from "./types";

export const BYOK_PROVIDER_API_KEY_ENV_VARS = {
	anthropic: ["ANTHROPIC_API_KEY"],
	openai: ["OPENAI_API_KEY"],
	google: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
	xai: ["XAI_API_KEY"],
	openrouter: ["OPENROUTER_API_KEY"],
} as const satisfies Record<ByokCloudProviderId, readonly string[]>;

export function resolveByokEnvCredential(
	provider: ByokCloudProviderId,
	credential: ByokEnvCredential
): string {
	const envVars = BYOK_PROVIDER_API_KEY_ENV_VARS[provider];
	for (const envVar of envVars) {
		const apiKey = credential.env[envVar];
		if (apiKey) {
			return apiKey;
		}
	}

	throw new ByokProviderError(
		`Missing ${provider} API key. Set ${envVars.join(" or ")} or pass apiKey explicitly.`
	);
}

export function resolveByokCloudProviderConfig(
	config: ByokCloudProviderConfig
): ByokApiKeyCloudProviderConfig {
	if ("apiKey" in config) {
		return {
			provider: config.provider,
			apiKey: config.apiKey,
			model: config.model,
		};
	}
	return {
		provider: config.provider,
		apiKey: resolveByokEnvCredential(config.provider, config.credential),
		model: config.model,
	};
}
