import {
	ByokProvider,
	createByokNodeProvider,
	findAvailableProviders,
	type ByokTransport,
	type ByokProviderConfig,
	type ByokProviderDeps,
} from "../../src/node";

const transport = (async () => new Response("{}")) as ByokTransport;

const deps: ByokProviderDeps = {
	transport,
};

const config: ByokProviderConfig = {
	provider: ByokProvider.CodexCli,
	command: "codex",
};

const provider = createByokNodeProvider(config, deps);
const availableProviders = findAvailableProviders({ env: process.env });

const textWithoutInstructions = provider.generateText({ prompt: "Explain BYOK." });
const textWithInstructions = provider.generateText({
	instructions: "Answer in one sentence.",
	prompt: "Explain BYOK.",
});
const streamedText = provider.streamText?.({ prompt: "Explain BYOK." });

void provider.testConnection;
void availableProviders;
void textWithoutInstructions;
void textWithInstructions;
void streamedText;
