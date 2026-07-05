import {
	ByokProvider,
	createByok,
	generateText,
	listModels,
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

void text;
void openRouterText;
void modelOptions;
void clientText;
