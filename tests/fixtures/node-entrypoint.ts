import {
	ByokProvider,
	createByokNodeProvider,
	findAvailableProviders,
	getManagedLocalCatalog,
	getManagedLocalCompatibility,
	ManagedLocalError,
	type ByokHttpClient,
	type ManagedLocalLifecycle,
	type ManagedLocalPreparationPlan,
	type ByokProviderConfig,
	type ByokProviderDeps,
} from "../../src/node";

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

const config: ByokProviderConfig = {
	provider: ByokProvider.CodexCli,
	command: "codex",
};

const provider = createByokNodeProvider(config, deps);
const availableProviders = findAvailableProviders({ env: process.env });
const catalog = getManagedLocalCatalog();
const compatibility = getManagedLocalCompatibility({ platform: "darwin", architecture: "arm64" });

const lifecycle: ManagedLocalLifecycle | undefined = undefined;
const preparationPlan: ManagedLocalPreparationPlan | undefined = undefined;
const errorCode: ManagedLocalError["code"] = "runtime-blocked";

const textWithoutInstructions = provider.generateText({ prompt: "Explain BYOK." });
const textWithInstructions = provider.generateText({
	instructions: "Answer in one sentence.",
	prompt: "Explain BYOK.",
});

void provider.testConnection;
void availableProviders;
void textWithoutInstructions;
void textWithInstructions;
void catalog;
void compatibility;
void lifecycle;
void preparationPlan;
void errorCode;
