import {
	ByokProvider,
	type ByokCloudProviderId,
	type ByokProviderDefinition,
	type ByokProviderId,
} from "./types";

type IconFreeDefinition = Omit<ByokProviderDefinition, "icon">;

interface CloudRuntimeManifest {
	baseURL: string;
	auth: "bearer" | "anthropic-api-key";
	modelNormalization: "default" | "name-fallback";
}

interface CloudManifestEntry {
	family: "cloud";
	id: ByokCloudProviderId;
	definition: IconFreeDefinition;
	apiKeyEnvVars: readonly [string, ...string[]];
	runtime: CloudRuntimeManifest;
}

interface LocalServerManifestEntry {
	family: "local-server";
	id: typeof ByokProvider.Ollama | typeof ByokProvider.LmStudio;
	definition: IconFreeDefinition;
}

interface CliManifestEntry {
	family: "cli";
	id: typeof ByokProvider.CodexCli | typeof ByokProvider.ClaudeCli;
	definition: IconFreeDefinition;
}

export type ProviderManifestEntry =
	CloudManifestEntry | LocalServerManifestEntry | CliManifestEntry;

const HOST_CREDENTIAL_DESCRIPTION =
	"Resolved by the host app at runtime; BYOK does not persist API keys.";

export const BYOK_PROVIDER_MANIFEST = [
	{
		family: "cloud",
		id: ByokProvider.Anthropic,
		definition: {
			id: ByokProvider.Anthropic,
			label: "Anthropic (Claude)",
			shortLabel: "Anthropic",
			productLabel: "Claude",
			vendor: "Anthropic",
			credentialKind: "api-key",
			credentialField: {
				label: "Anthropic API key",
				placeholder: "sk-ant-...",
				description: HOST_CREDENTIAL_DESCRIPTION,
				secret: true,
				missingMessage: "Enter your Anthropic API key first.",
				resetModelsMessage: "Enter your Anthropic API key first to fetch models.",
			},
			modelBehavior: "required",
			modelField: {
				label: "Claude model",
				placeholder: "Select a model",
				description: "Claude model for AI generation.",
				listModelsLabel: "Anthropic models",
				listModelsDescription: "Fetch Anthropic models for this account.",
				emptyListMessage: "No Anthropic models were returned for this account.",
			},
			requiresNetwork: true,
			requiresDownload: false,
			supportsModelListing: true,
		},
		apiKeyEnvVars: ["ANTHROPIC_API_KEY"],
		runtime: {
			baseURL: "https://api.anthropic.com/v1",
			auth: "anthropic-api-key",
			modelNormalization: "default",
		},
	},
	{
		family: "cloud",
		id: ByokProvider.OpenAI,
		definition: {
			id: ByokProvider.OpenAI,
			label: "OpenAI (ChatGPT)",
			shortLabel: "OpenAI",
			productLabel: "ChatGPT",
			vendor: "OpenAI",
			credentialKind: "api-key",
			credentialField: {
				label: "OpenAI API key",
				placeholder: "sk-...",
				description: HOST_CREDENTIAL_DESCRIPTION,
				secret: true,
				missingMessage: "Enter your OpenAI API key first.",
				resetModelsMessage: "Enter your OpenAI API key first to fetch models.",
			},
			modelBehavior: "required",
			modelField: {
				label: "OpenAI model",
				placeholder: "Select a model",
				description: "OpenAI model for AI generation.",
				listModelsLabel: "OpenAI models",
				listModelsDescription: "Fetch OpenAI models for this account.",
				emptyListMessage: "No OpenAI models were returned for this account.",
			},
			requiresNetwork: true,
			requiresDownload: false,
			supportsModelListing: true,
		},
		apiKeyEnvVars: ["OPENAI_API_KEY"],
		runtime: {
			baseURL: "https://api.openai.com/v1",
			auth: "bearer",
			modelNormalization: "default",
		},
	},
	{
		family: "cloud",
		id: ByokProvider.Google,
		definition: {
			id: ByokProvider.Google,
			label: "Google (Gemini)",
			shortLabel: "Gemini",
			productLabel: "Gemini",
			vendor: "Google",
			credentialKind: "api-key",
			credentialField: {
				label: "Google API key",
				placeholder: "AIza...",
				description: HOST_CREDENTIAL_DESCRIPTION,
				secret: true,
				missingMessage: "Enter your Google API key first.",
				resetModelsMessage: "Enter your Google API key first to fetch models.",
			},
			modelBehavior: "required",
			modelField: {
				label: "Gemini model",
				placeholder: "Select a model",
				description: "Gemini model for AI generation.",
				listModelsLabel: "Gemini models",
				listModelsDescription: "Fetch Gemini models for this account.",
				emptyListMessage: "No Gemini models were returned for this account.",
			},
			requiresNetwork: true,
			requiresDownload: false,
			supportsModelListing: true,
		},
		apiKeyEnvVars: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
		runtime: {
			baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
			auth: "bearer",
			modelNormalization: "default",
		},
	},
	{
		family: "cloud",
		id: ByokProvider.Xai,
		definition: {
			id: ByokProvider.Xai,
			label: "xAI (Grok)",
			shortLabel: "xAI",
			productLabel: "Grok",
			vendor: "xAI",
			credentialKind: "api-key",
			credentialField: {
				label: "xAI API key",
				placeholder: "xai-...",
				description: HOST_CREDENTIAL_DESCRIPTION,
				secret: true,
				missingMessage: "Enter your xAI API key first.",
				resetModelsMessage: "Enter your xAI API key first to fetch models.",
			},
			modelBehavior: "required",
			modelField: {
				label: "Grok model",
				placeholder: "Select a model",
				description: "Grok model for AI generation.",
				listModelsLabel: "xAI models",
				listModelsDescription: "Fetch xAI models for this account.",
				emptyListMessage: "No xAI models were returned for this account.",
			},
			requiresNetwork: true,
			requiresDownload: false,
			supportsModelListing: true,
		},
		apiKeyEnvVars: ["XAI_API_KEY"],
		runtime: { baseURL: "https://api.x.ai/v1", auth: "bearer", modelNormalization: "default" },
	},
	{
		family: "cloud",
		id: ByokProvider.OpenRouter,
		definition: {
			id: ByokProvider.OpenRouter,
			label: "OpenRouter",
			shortLabel: "OpenRouter",
			productLabel: "OpenRouter",
			vendor: "OpenRouter",
			credentialKind: "api-key",
			credentialField: {
				label: "OpenRouter API key",
				placeholder: "sk-or-...",
				description: HOST_CREDENTIAL_DESCRIPTION,
				secret: true,
				missingMessage: "Enter your OpenRouter API key first.",
				resetModelsMessage: "Enter your OpenRouter API key first to fetch models.",
			},
			modelBehavior: "required",
			modelField: {
				label: "OpenRouter model",
				placeholder: "Select a model",
				description: "OpenRouter provider/model ID.",
				listModelsLabel: "OpenRouter models",
				listModelsDescription: "Fetch OpenRouter models for this account.",
				emptyListMessage: "No OpenRouter models were returned for this account.",
			},
			requiresNetwork: true,
			requiresDownload: false,
			supportsModelListing: true,
		},
		apiKeyEnvVars: ["OPENROUTER_API_KEY"],
		runtime: {
			baseURL: "https://openrouter.ai/api/v1",
			auth: "bearer",
			modelNormalization: "name-fallback",
		},
	},
	{
		family: "local-server",
		id: ByokProvider.Ollama,
		definition: {
			id: ByokProvider.Ollama,
			label: "Ollama",
			shortLabel: "Ollama",
			productLabel: "Ollama",
			vendor: "Ollama",
			credentialKind: "url",
			credentialField: {
				label: "Ollama URL",
				placeholder: "http://localhost:11434",
				description: "Local Ollama server URL.",
				secret: false,
				missingMessage: "Enter your Ollama URL first.",
				resetModelsMessage: "Enter your Ollama URL first to fetch models.",
			},
			modelBehavior: "required",
			modelField: {
				label: "Ollama model",
				placeholder: "Select a model",
				description: "Installed Ollama model.",
				listModelsLabel: "Ollama models",
				listModelsDescription: "Fetch installed Ollama models.",
				emptyListMessage: "No Ollama models were returned by the configured URL.",
			},
			requiresNetwork: false,
			requiresDownload: false,
			supportsModelListing: true,
		},
	},
	{
		family: "local-server",
		id: ByokProvider.LmStudio,
		definition: {
			id: ByokProvider.LmStudio,
			label: "LM Studio",
			shortLabel: "LM Studio",
			productLabel: "LM Studio",
			vendor: "LM Studio",
			credentialKind: "url",
			credentialField: {
				label: "LM Studio URL",
				placeholder: "http://localhost:1234/v1",
				description: "Local LM Studio OpenAI-compatible REST API URL.",
				secret: false,
				missingMessage: "Enter your LM Studio URL first.",
				resetModelsMessage: "Enter your LM Studio URL first to fetch models.",
			},
			modelBehavior: "required",
			modelField: {
				label: "LM Studio model",
				placeholder: "Select a model",
				description: "Loaded LM Studio model.",
				listModelsLabel: "LM Studio models",
				listModelsDescription: "Fetch models from the local LM Studio server.",
				emptyListMessage: "No LM Studio models were returned by the configured URL.",
			},
			requiresNetwork: false,
			requiresDownload: false,
			supportsModelListing: true,
		},
	},
	{
		family: "cli",
		id: ByokProvider.CodexCli,
		definition: {
			id: ByokProvider.CodexCli,
			label: "Codex CLI",
			shortLabel: "Codex CLI",
			productLabel: "Codex CLI",
			vendor: "Codex CLI",
			credentialKind: "command",
			credentialField: {
				label: "Codex CLI command",
				placeholder: "codex",
				description: "Local Codex CLI command.",
				secret: false,
				missingMessage: "Enter your Codex CLI command first.",
				resetModelsMessage: "Enter your Codex CLI command first to fetch models.",
			},
			modelBehavior: "optional",
			modelField: {
				label: "Codex CLI model override",
				placeholder: "CLI default",
				description: "Optional model override.",
				listModelsLabel: "Codex CLI models",
				listModelsDescription: "Fetch models from `codex debug models`.",
				emptyListMessage: "No Codex CLI models were returned by the configured command.",
			},
			requiresNetwork: true,
			requiresDownload: false,
			supportsModelListing: true,
		},
	},
	{
		family: "cli",
		id: ByokProvider.ClaudeCli,
		definition: {
			id: ByokProvider.ClaudeCli,
			label: "Claude CLI",
			shortLabel: "Claude CLI",
			productLabel: "Claude CLI",
			vendor: "Claude CLI",
			credentialKind: "command",
			credentialField: {
				label: "Claude CLI command",
				placeholder: "claude",
				description: "Local Claude CLI command.",
				secret: false,
				missingMessage: "Enter your Claude CLI command first.",
				resetModelsMessage: "Enter your Claude CLI command first to fetch models.",
			},
			modelBehavior: "optional",
			modelField: {
				label: "Claude CLI model override",
				placeholder: "CLI default",
				description: "Optional model override.",
				listModelsLabel: "Claude CLI models",
				listModelsDescription:
					"Fetch latest Anthropic models from OpenRouter and use Claude CLI model IDs.",
				emptyListMessage: "No Anthropic models were returned by OpenRouter.",
			},
			requiresNetwork: true,
			requiresDownload: false,
			supportsModelListing: true,
		},
	},
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
