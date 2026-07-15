import {
	ByokProviderError,
	type ByokApiKeyCloudProviderConfig,
	type ByokCloudProviderConfig,
	type ByokCloudProviderId,
	type ByokEnvCredential,
} from "./types";
import { BYOK_CLOUD_PROVIDER_MANIFEST } from "./provider-manifest";

type ProviderApiKeyEnvVars = {
	readonly [
		Provider in keyof typeof BYOK_CLOUD_PROVIDER_MANIFEST
	]: (typeof BYOK_CLOUD_PROVIDER_MANIFEST)[Provider]["apiKeyEnvVars"];
};

function apiKeyEnvVars(): ProviderApiKeyEnvVars {
	const envVars = {} as Record<ByokCloudProviderId, readonly [string, ...string[]]>;
	for (const provider of Object.keys(BYOK_CLOUD_PROVIDER_MANIFEST) as ByokCloudProviderId[]) {
		envVars[provider] = BYOK_CLOUD_PROVIDER_MANIFEST[provider].apiKeyEnvVars;
	}
	return envVars as ProviderApiKeyEnvVars;
}

export const BYOK_PROVIDER_API_KEY_ENV_VARS = apiKeyEnvVars();

type ApiKeyEnvVar = ProviderApiKeyEnvVars[keyof ProviderApiKeyEnvVars][number];

export const BYOK_API_KEY_ENV_VARS = Object.values(
	BYOK_PROVIDER_API_KEY_ENV_VARS
).flat() as readonly ApiKeyEnvVar[];

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
