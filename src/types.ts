import type { z } from "zod/v3";

export enum ByokProvider {
	Ollama = "ollama",
	Anthropic = "anthropic",
	OpenAI = "openai",
	Google = "google",
	Xai = "xai",
	OpenRouter = "openrouter",
	Groq = "groq",
	Mistral = "mistral",
	DeepSeek = "deepseek",
	DeepInfra = "deepinfra",
	LmStudio = "lm-studio",
	CodexCli = "codex-cli",
	ClaudeCli = "claude-cli",
}

export type ByokProviderId = `${ByokProvider}`;

export type ByokCloudProviderId =
	| "anthropic"
	| "openai"
	| "google"
	| "xai"
	| "openrouter"
	| "groq"
	| "mistral"
	| "deepseek"
	| "deepinfra";

export type ByokOllamaProviderId = "ollama";

export type ByokLmStudioProviderId = "lm-studio";

export type ByokCliProviderId = "codex-cli" | "claude-cli";

export type ByokEnvironment = Readonly<Record<string, string | undefined>>;

export interface ByokEnvCredential {
	source: "env";
	env: ByokEnvironment;
}

export interface ByokApiKeyCloudProviderConfig {
	provider: ByokCloudProviderId;
	apiKey: string;
	model: string;
}

export interface ByokEnvCloudProviderConfig {
	provider: ByokCloudProviderId;
	credential: ByokEnvCredential;
	model: string;
}

export type ByokCloudProviderConfig = ByokApiKeyCloudProviderConfig | ByokEnvCloudProviderConfig;

export interface ByokOllamaProviderConfig {
	provider: ByokOllamaProviderId;
	url?: string;
	model: string;
}

export interface ByokLmStudioProviderConfig {
	provider: ByokLmStudioProviderId;
	url?: string;
	model: string;
}

export interface ByokCliProviderConfig {
	provider: ByokCliProviderId;
	command: string;
	model?: string;
}

export type ByokProviderConfig =
	| ByokCloudProviderConfig
	| ByokOllamaProviderConfig
	| ByokLmStudioProviderConfig
	| ByokCliProviderConfig;

export type ByokCoreProviderConfig =
	ByokApiKeyCloudProviderConfig | ByokOllamaProviderConfig | ByokLmStudioProviderConfig;

export interface ByokHttpRequest {
	url: string;
	method: "GET" | "POST";
	body?: string;
	headers?: Record<string, string>;
	signal?: AbortSignal;
}

export interface ByokHttpResponse {
	status: number;
	text: string;
	json: unknown;
}

export type ByokHttpClient = (request: ByokHttpRequest) => Promise<ByokHttpResponse>;

export interface ByokProviderDeps {
	fetchImpl: typeof fetch;
	http: ByokHttpClient;
}

export type ByokFacadeDeps = Partial<ByokProviderDeps>;

export interface ByokProviderStatus {
	ok: boolean;
	message: string;
	models?: string[];
}

export type ByokConnectionState = "untested" | "verified" | "stale";

export interface ByokVerificationSnapshot {
	credentialFingerprint: string;
	credentialToken?: string;
	modelId: string;
	testedAt: string;
}

export type ByokVerificationSnapshotMap = Partial<Record<ByokProviderId, ByokVerificationSnapshot>>;

export interface ByokSetupStatus {
	keySaved: boolean;
	modelSelected: boolean;
	connection: ByokConnectionState;
	testedAt?: string;
}

export interface ByokModelOption {
	id: string;
	label: string;
}

export interface ByokProviderStoredSettings {
	credential: string;
	credentialSaved?: boolean;
	credentialUpdatedAt?: string;
	credentialLength?: number;
	model: string;
	modelSelection?: string;
	availableModels: string[];
	modelOptions: ByokModelOption[];
	hasFetchedModels: boolean;
	modelRefreshMessage: string;
}

export interface ByokStoredSettings {
	selectedProvider: ByokProviderId;
	providers: Partial<Record<ByokProviderId, ByokProviderStoredSettings>>;
	verification: ByokVerificationSnapshotMap;
}

export interface ByokModelRefreshResult {
	models: string[];
	options: ByokModelOption[];
	message: string;
}

export interface ByokTextGenerationInput {
	prompt: string;
	/** Ask providers with native support to constrain the response to JSON text. */
	responseFormat?: "text" | "json";
	/** Optional JSON schema for providers that support structured text output. */
	jsonSchema?: string;
}

export interface ByokTextGenerationOutput {
	text: string;
}

export type ByokGenerateTextOptions =
	| (ByokCloudProviderConfig & {
			prompt: string;
			deps?: ByokFacadeDeps;
			signal?: AbortSignal;
	  })
	| (ByokOllamaProviderConfig & {
			prompt: string;
			deps?: ByokFacadeDeps;
			signal?: AbortSignal;
	  })
	| (ByokLmStudioProviderConfig & {
			prompt: string;
			deps?: ByokFacadeDeps;
			signal?: AbortSignal;
	  });

export type ByokListModelsOptions =
	| (Omit<ByokApiKeyCloudProviderConfig, "model"> & {
			deps?: ByokFacadeDeps;
	  })
	| (Omit<ByokEnvCloudProviderConfig, "model"> & {
			deps?: ByokFacadeDeps;
	  })
	| (Omit<ByokOllamaProviderConfig, "model"> & {
			deps?: ByokFacadeDeps;
	  })
	| (Omit<ByokLmStudioProviderConfig, "model"> & {
			deps?: ByokFacadeDeps;
	  });

export type ByokClientConfig =
	| (Omit<ByokApiKeyCloudProviderConfig, "model"> & {
			deps?: ByokFacadeDeps;
	  })
	| (Omit<ByokEnvCloudProviderConfig, "model"> & {
			deps?: ByokFacadeDeps;
	  })
	| (Omit<ByokOllamaProviderConfig, "model"> & {
			deps?: ByokFacadeDeps;
	  })
	| (Omit<ByokLmStudioProviderConfig, "model"> & {
			deps?: ByokFacadeDeps;
	  });

export interface ByokClientTextGenerationInput {
	model: string;
	prompt: string;
	signal?: AbortSignal;
}

export interface ByokClient {
	generateText(input: ByokClientTextGenerationInput): Promise<ByokTextGenerationOutput>;
}

export interface ByokObjectGenerationInput<T> {
	prompt: string;
	schema: z.ZodType<T, z.ZodTypeDef, unknown>;
}

export interface ByokProviderRuntime {
	id: ByokProviderId;
	label: string;
	requiresNetwork: boolean;
	requiresDownload: boolean;
	sectionConcurrencyLimit?: number;
	testConnection(): Promise<ByokProviderStatus>;
	listModels(): Promise<ByokModelOption[]>;
	generateText(
		input: ByokTextGenerationInput,
		signal?: AbortSignal
	): Promise<ByokTextGenerationOutput>;
	generateObject?<T>(input: ByokObjectGenerationInput<T>, signal?: AbortSignal): Promise<T>;
}

export class ByokProviderError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ByokProviderError";
	}
}

export class ByokProviderRateLimitError extends ByokProviderError {
	readonly retryAfterMs: number | null;

	constructor(message: string, retryAfterMs: number | null = null) {
		super(message);
		this.name = "ByokProviderRateLimitError";
		this.retryAfterMs = retryAfterMs;
	}
}
