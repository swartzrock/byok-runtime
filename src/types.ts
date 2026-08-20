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
	Together = "together",
	Fireworks = "fireworks",
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
	| "deepinfra"
	| "together"
	| "fireworks";

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

/** Host-owned HTTP boundary. The runtime always supplies one normalized Request. */
export interface ByokTransport {
	(request: Request): Promise<Response>;
	/** Set true only when response bodies arrive progressively from the provider. */
	readonly supportsStreaming?: boolean;
}

export interface ByokProviderDeps {
	transport: ByokTransport;
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
	/** Optional system/developer instructions sent separately from the user prompt. */
	instructions?: string;
	/** Ask providers with native support to constrain the response to JSON text. */
	responseFormat?: "text" | "json";
	/** Optional JSON schema for providers that support structured text output. */
	jsonSchema?: string;
}

export interface ByokTextGenerationOutput {
	text: string;
}

export type ByokTextStreamDelivery = "native" | "buffered";

export interface ByokTextStream {
	/** Whether text arrives progressively from the provider or as one completed response. */
	readonly delivery: ByokTextStreamDelivery;
	/** Single-consumer text deltas whose concatenation is the exact generated text. */
	readonly textStream: AsyncIterable<string>;
}

export type ByokGenerateTextOptions =
	| (ByokCloudProviderConfig & {
			prompt: string;
			instructions?: string;
			deps?: ByokFacadeDeps;
			signal?: AbortSignal;
	  })
	| (ByokOllamaProviderConfig & {
			prompt: string;
			instructions?: string;
			deps?: ByokFacadeDeps;
			signal?: AbortSignal;
	  })
	| (ByokLmStudioProviderConfig & {
			prompt: string;
			instructions?: string;
			deps?: ByokFacadeDeps;
			signal?: AbortSignal;
	  });

export type ByokStreamTextOptions = ByokGenerateTextOptions;

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
	instructions?: string;
	signal?: AbortSignal;
}

export interface ByokClient {
	generateText(input: ByokClientTextGenerationInput): Promise<ByokTextGenerationOutput>;
}

export interface ByokStreamingClient extends ByokClient {
	streamText(input: ByokClientTextGenerationInput): ByokTextStream;
}

export interface ByokObjectGenerationInput<T> {
	prompt: string;
	/** Optional system/developer instructions sent separately from the user prompt. */
	instructions?: string;
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
	streamText?(input: ByokTextGenerationInput, signal?: AbortSignal): ByokTextStream;
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
