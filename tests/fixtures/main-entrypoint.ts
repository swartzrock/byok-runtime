import {
	ByokProvider,
	BYOK_PROVIDER_API_KEY_ENV_VARS,
	BYOK_PROVIDER_IDS,
	createByok,
	generateText,
	listModels,
	resolveByokEnvCredential,
	type ByokHttpClient,
	type ByokProviderDeps,
} from "../../src";

const http: ByokHttpClient = async () => ({
	status: 200,
	text: "{}",
	json: {},
});
const fetchImpl = (async () => new Response("{}")) as typeof fetch;

const deps: ByokProviderDeps = {
	fetchImpl,
	http,
};
const env = {
	OPENAI_API_KEY: "sk-test",
	GOOGLE_API_KEY: "google-test",
	GEMINI_API_KEY: "gemini-test",
};

const text = generateText({
	provider: ByokProvider.OpenAI,
	apiKey: "sk-test",
	model: "gpt-4o-mini",
	prompt: "Explain BYOK in one sentence.",
	deps,
});

const openRouterText = generateText({
	provider: ByokProvider.OpenRouter,
	apiKey: "sk-test",
	model: "openai/gpt-4o",
	prompt: "Explain BYOK in one sentence.",
	deps,
});

const modelOptions = listModels({
	provider: ByokProvider.OpenAI,
	apiKey: "sk-test",
	deps,
});

const envText = generateText({
	provider: ByokProvider.OpenAI,
	credential: { source: "env", env },
	model: "gpt-4o-mini",
	prompt: "Explain BYOK in one sentence.",
	deps,
});

const envModelOptions = listModels({
	provider: ByokProvider.Google,
	credential: { source: "env", env },
	deps,
});

void listModels({
	provider: ByokProvider.Ollama,
	url: "http://localhost:11434",
	deps,
});

void listModels({
	provider: ByokProvider.OpenAI,
	apiKey: "sk-test",
	// @ts-expect-error model is not required or accepted for model discovery.
	model: "gpt-4o-mini",
	deps,
});

void generateText({
	provider: ByokProvider.OpenRouter,
	apiKey: "sk-test",
	model: "gpt-4o-mini",
	prompt: "Explain BYOK in one sentence.",
	// @ts-expect-error provider-specific schema hints belong on the lower-level runtime.
	jsonSchema: "{}",
	deps,
});

const client = createByok({
	provider: ByokProvider.OpenAI,
	apiKey: "sk-test",
	deps,
});

const envClient = createByok({
	provider: ByokProvider.OpenAI,
	credential: { source: "env", env },
	deps,
});

void listModels({
	// @ts-expect-error use ByokProvider.OpenAI to avoid typos like this.
	provider: "oppenai",
	apiKey: "sk-test",
	deps,
});

const clientText = client.generateText({
	model: "gpt-4o-mini",
	prompt: "Explain BYOK in one sentence.",
});

const envClientText = envClient.generateText({
	model: "gpt-4o-mini",
	prompt: "Explain BYOK in one sentence.",
});

const googleApiKey = resolveByokEnvCredential(ByokProvider.Google, {
	source: "env",
	env,
});
const anthropicEnvVars: readonly ["ANTHROPIC_API_KEY"] = BYOK_PROVIDER_API_KEY_ENV_VARS.anthropic;
const googleEnvVars: readonly ["GOOGLE_API_KEY", "GEMINI_API_KEY"] =
	BYOK_PROVIDER_API_KEY_ENV_VARS.google;
const groqEnvVars: readonly ["GROQ_API_KEY"] = BYOK_PROVIDER_API_KEY_ENV_VARS.groq;
const mistralEnvVars: readonly ["MISTRAL_API_KEY"] = BYOK_PROVIDER_API_KEY_ENV_VARS.mistral;
const deepSeekEnvVars: readonly ["DEEPSEEK_API_KEY"] = BYOK_PROVIDER_API_KEY_ENV_VARS.deepseek;
const deepInfraEnvVars: readonly ["DEEPINFRA_TOKEN"] = BYOK_PROVIDER_API_KEY_ENV_VARS.deepinfra;
const providerIds: readonly [
	"anthropic",
	"openai",
	"google",
	"xai",
	"openrouter",
	"groq",
	"mistral",
	"deepseek",
	"deepinfra",
	"ollama",
	"lm-studio",
	"codex-cli",
	"claude-cli",
] = BYOK_PROVIDER_IDS;

void text;
void openRouterText;
void modelOptions;
void envText;
void envModelOptions;
void clientText;
void envClientText;
void googleApiKey;
void anthropicEnvVars;
void googleEnvVars;
void groqEnvVars;
void mistralEnvVars;
void deepSeekEnvVars;
void deepInfraEnvVars;
void providerIds;
