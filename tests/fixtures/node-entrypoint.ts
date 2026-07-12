import {
	ByokProvider,
	createByokNodeProvider,
	findAvailableProviders,
	type ByokHttpClient,
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

void provider.testConnection;
void availableProviders;
