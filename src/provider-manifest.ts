import {
	ByokProvider,
	type ByokCliProviderId,
	type ByokCloudProviderId,
	type ByokProviderId,
} from "./types";

interface CloudRuntimeManifest {
	label: string;
	vendor: string;
	baseURL: string;
	auth: "bearer" | "anthropic-api-key";
	modelNormalization: "default" | "name-fallback";
}

interface CloudManifestEntry {
	family: "cloud";
	id: ByokCloudProviderId;
	apiKeyEnvVars: readonly [string, ...string[]];
	runtime: CloudRuntimeManifest;
}

interface LocalServerManifestEntry {
	family: "local-server";
	id: typeof ByokProvider.Ollama | typeof ByokProvider.LmStudio;
}

interface CliManifestEntry {
	family: "cli";
	id: ByokCliProviderId;
}

export type ProviderManifestEntry =
	CloudManifestEntry | LocalServerManifestEntry | CliManifestEntry;

export const BYOK_PROVIDER_MANIFEST = [
	{
		family: "cloud",
		id: ByokProvider.Anthropic,
		apiKeyEnvVars: ["ANTHROPIC_API_KEY"],
		runtime: {
			label: "Anthropic (Claude)",
			vendor: "Anthropic",
			baseURL: "https://api.anthropic.com/v1",
			auth: "anthropic-api-key",
			modelNormalization: "default",
		},
	},
	{
		family: "cloud",
		id: ByokProvider.OpenAI,
		apiKeyEnvVars: ["OPENAI_API_KEY"],
		runtime: {
			label: "OpenAI (ChatGPT)",
			vendor: "OpenAI",
			baseURL: "https://api.openai.com/v1",
			auth: "bearer",
			modelNormalization: "default",
		},
	},
	{
		family: "cloud",
		id: ByokProvider.Google,
		apiKeyEnvVars: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
		runtime: {
			label: "Google (Gemini)",
			vendor: "Google",
			baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
			auth: "bearer",
			modelNormalization: "default",
		},
	},
	{
		family: "cloud",
		id: ByokProvider.Xai,
		apiKeyEnvVars: ["XAI_API_KEY"],
		runtime: {
			label: "xAI (Grok)",
			vendor: "xAI",
			baseURL: "https://api.x.ai/v1",
			auth: "bearer",
			modelNormalization: "default",
		},
	},
	{
		family: "cloud",
		id: ByokProvider.OpenRouter,
		apiKeyEnvVars: ["OPENROUTER_API_KEY"],
		runtime: {
			label: "OpenRouter",
			vendor: "OpenRouter",
			baseURL: "https://openrouter.ai/api/v1",
			auth: "bearer",
			modelNormalization: "name-fallback",
		},
	},
	{
		family: "cloud",
		id: ByokProvider.Groq,
		apiKeyEnvVars: ["GROQ_API_KEY"],
		runtime: {
			label: "Groq",
			vendor: "Groq",
			baseURL: "https://api.groq.com/openai/v1",
			auth: "bearer",
			modelNormalization: "default",
		},
	},
	{
		family: "cloud",
		id: ByokProvider.Mistral,
		apiKeyEnvVars: ["MISTRAL_API_KEY"],
		runtime: {
			label: "Mistral",
			vendor: "Mistral",
			baseURL: "https://api.mistral.ai/v1",
			auth: "bearer",
			modelNormalization: "default",
		},
	},
	{
		family: "cloud",
		id: ByokProvider.DeepSeek,
		apiKeyEnvVars: ["DEEPSEEK_API_KEY"],
		runtime: {
			label: "DeepSeek",
			vendor: "DeepSeek",
			baseURL: "https://api.deepseek.com",
			auth: "bearer",
			modelNormalization: "default",
		},
	},
	{
		family: "cloud",
		id: ByokProvider.DeepInfra,
		apiKeyEnvVars: ["DEEPINFRA_TOKEN"],
		runtime: {
			label: "DeepInfra",
			vendor: "DeepInfra",
			baseURL: "https://api.deepinfra.com/v1/openai",
			auth: "bearer",
			modelNormalization: "default",
		},
	},
	{ family: "local-server", id: ByokProvider.Ollama },
	{ family: "local-server", id: ByokProvider.LmStudio },
	{ family: "cli", id: ByokProvider.CodexCli },
	{ family: "cli", id: ByokProvider.ClaudeCli },
] as const satisfies readonly ProviderManifestEntry[];

type CloudProviderManifest = {
	readonly [
		Entry in Extract<(typeof BYOK_PROVIDER_MANIFEST)[number], { family: "cloud" }> as Entry["id"]
	]: Entry;
};

function cloudProviderManifest(): CloudProviderManifest {
	const manifest = {} as Record<ByokCloudProviderId, CloudManifestEntry>;
	for (const entry of BYOK_PROVIDER_MANIFEST) {
		if (entry.family === "cloud") manifest[entry.id] = entry;
	}
	return manifest as CloudProviderManifest;
}

export const BYOK_CLOUD_PROVIDER_MANIFEST = cloudProviderManifest();

export function isCloudProviderId(id: ByokProviderId): id is ByokCloudProviderId {
	return id in BYOK_CLOUD_PROVIDER_MANIFEST;
}

export function isCliProviderId(id: ByokProviderId): id is ByokCliProviderId {
	return BYOK_PROVIDER_MANIFEST.some((entry) => entry.family === "cli" && String(entry.id) === id);
}
