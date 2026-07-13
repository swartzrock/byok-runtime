import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { BYOK_PROVIDER_API_KEY_ENV_VARS } from "./credentials";
import type { ByokCloudProviderId, ByokEnvironment, ByokProviderId } from "./types";

const LOCAL_PROBES = [
	{ provider: "ollama", url: "http://127.0.0.1:11434/api/tags" },
	{ provider: "lm-studio", url: "http://127.0.0.1:1234/v1/models" },
] as const;

const CLI_PROBES = [
	{ provider: "codex-cli", command: "codex" },
	{ provider: "claude-cli", command: "claude" },
] as const;

const PROBE_TIMEOUT_MS = 1_000;
const CLOUD_PROVIDERS = [
	"anthropic",
	"openai",
	"google",
	"xai",
	"openrouter",
	"groq",
	"mistral",
	"deepseek",
	"deepinfra",
] as const satisfies readonly ByokCloudProviderId[];

export interface FindAvailableProvidersOptions {
	env: ByokEnvironment;
}

export interface FindAvailableProvidersDeps {
	fetchImpl?: typeof fetch;
	commandExists?: (command: string, env: ByokEnvironment) => Promise<boolean>;
}

async function probeUrl(fetchImpl: typeof fetch, url: string): Promise<boolean> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
	try {
		const response = await fetchImpl(url, { method: "GET", signal: controller.signal });
		const available = response.ok;
		await response.body?.cancel().catch(() => undefined);
		return available;
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
	}
}

async function commandExists(command: string, env: ByokEnvironment): Promise<boolean> {
	const path = env.PATH ?? env.Path ?? env.path ?? "";
	const extensions =
		process.platform === "win32"
			? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
			: [""];

	for (const directory of path.split(delimiter).filter(Boolean)) {
		for (const extension of extensions) {
			try {
				const candidate = join(directory, `${command}${extension}`);
				if (!(await stat(candidate)).isFile()) continue;
				await access(candidate, constants.X_OK);
				return true;
			} catch {
				// Keep searching the supplied PATH.
			}
		}
	}
	return false;
}

async function probeCommand(
	probe: (command: string, env: ByokEnvironment) => Promise<boolean>,
	command: string,
	env: ByokEnvironment
): Promise<boolean> {
	try {
		return await probe(command, env);
	} catch {
		return false;
	}
}

export async function findAvailableProviders(
	options: FindAvailableProvidersOptions,
	deps: FindAvailableProvidersDeps = {}
): Promise<ByokProviderId[]> {
	const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
	const commandProbe = deps.commandExists ?? commandExists;
	const [localResults, cliResults] = await Promise.all([
		Promise.all(
			LOCAL_PROBES.map(
				async ({ provider, url }) => [provider, await probeUrl(fetchImpl, url)] as const
			)
		),
		Promise.all(
			CLI_PROBES.map(
				async ({ provider, command }) =>
					[provider, await probeCommand(commandProbe, command, options.env)] as const
			)
		),
	]);
	const providers: ByokProviderId[] = [];

	for (const [provider, available] of [...localResults, ...cliResults]) {
		if (available) providers.push(provider);
	}
	for (const provider of CLOUD_PROVIDERS) {
		if (BYOK_PROVIDER_API_KEY_ENV_VARS[provider].some((name) => options.env[name])) {
			providers.push(provider);
		}
	}

	return providers;
}
