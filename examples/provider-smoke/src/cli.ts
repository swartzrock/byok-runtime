import { pathToFileURL } from "node:url";
import {
	byokProviderDefinition,
	generateText,
	isByokProviderId,
	listModels,
	type ByokCliProviderId,
	type ByokCliProviderConfig,
	type ByokCloudProviderId,
	type ByokListModelsOptions,
	type ByokProviderId,
} from "../../../src";
import { createByokNodeProvider } from "../../../src/node";

type SmokeCloudProvider = ByokCloudProviderId;
type SmokeCliProvider = ByokCliProviderId;
type SmokeProvider = ByokProviderId;
type SmokeEnv = Readonly<Record<string, string | undefined>>;

const CLI_PROVIDER_COMMANDS: Record<SmokeCliProvider, string> = {
	"codex-cli": "codex",
	"claude-cli": "claude",
};

interface SmokeByok {
	generateText: typeof generateText;
	listModels: typeof listModels;
}

interface RunProviderSmokeCliOptions {
	env?: SmokeEnv;
	stdout?: (line: string) => void;
	stderr?: (line: string) => void;
	byok?: SmokeByok;
	createNodeProvider?: typeof createByokNodeProvider;
}

interface ParsedBaseFlags {
	provider: SmokeProvider;
	apiKey?: string;
	url?: string;
	executable?: string;
}

interface ParsedGenerateFlags extends ParsedBaseFlags {
	command: "generate";
	model: string;
	input: string;
}

interface ParsedModelsFlags extends ParsedBaseFlags {
	command: "models";
}

type ParsedFlags = ParsedGenerateFlags | ParsedModelsFlags;

const USAGE = `Usage:
  bun run provider-smoke models --provider <provider> [--api-key <key>] [--url <url>] [--executable <path>]
  bun run provider-smoke generate --provider <provider> --model <model> --input <text> [--api-key <key>] [--url <url>] [--executable <path>]

Providers: anthropic, openai, google, xai, openrouter, ollama, lm-studio, codex-cli, claude-cli`;

export async function runProviderSmokeCli(
	args: string[] = process.argv.slice(2),
	options: RunProviderSmokeCliOptions = {}
): Promise<number> {
	const stderr = options.stderr ?? console.error;
	const stdout = options.stdout ?? console.log;
	const byok = options.byok ?? { generateText, listModels };
	const createNodeProvider = options.createNodeProvider ?? createByokNodeProvider;
	const env = options.env ?? process.env;
	const parsed = parseArgs(args);

	if (!parsed.ok) {
		stderr(parsed.error);
		stderr(USAGE);
		return 1;
	}

	try {
		if (isSmokeCliProvider(parsed.flags.provider)) {
			const provider = createNodeProvider(cliProviderConfig(parsed.flags));
			if (parsed.flags.command === "models") {
				const models = await provider.listModels();
				for (const model of models) {
					stdout(model.id);
				}
				return 0;
			}

			const result = await provider.generateText({ prompt: parsed.flags.input });
			stdout(result.text);
			return 0;
		}

		if (parsed.flags.command === "models") {
			const models = await byok.listModels(providerConfig(parsed.flags, env));
			for (const model of models) {
				stdout(model.id);
			}
			return 0;
		}

		const result = await byok.generateText({
			...providerConfig(parsed.flags, env),
			model: parsed.flags.model,
			prompt: parsed.flags.input,
		});
		stdout(result.text);
		return 0;
	} catch (error) {
		stderr(error instanceof Error ? error.message : String(error));
		return 1;
	}
}

function cliProviderConfig(flags: ParsedFlags): ByokCliProviderConfig {
	if (!isSmokeCliProvider(flags.provider)) {
		throw new Error("Expected a CLI provider.");
	}
	return {
		provider: flags.provider,
		command: flags.executable ?? CLI_PROVIDER_COMMANDS[flags.provider],
		...(flags.command === "generate" ? { model: flags.model } : {}),
	};
}

function providerConfig(flags: ParsedFlags, env: SmokeEnv): ByokListModelsOptions {
	if (flags.provider === "ollama" || flags.provider === "lm-studio") {
		return {
			provider: flags.provider,
			url: flags.url,
		};
	}
	if (flags.apiKey) {
		if (!isSmokeCloudProvider(flags.provider)) {
			throw new Error("Expected an API-key provider.");
		}
		return {
			provider: flags.provider,
			apiKey: flags.apiKey,
		};
	}
	if (!isSmokeCloudProvider(flags.provider)) {
		throw new Error("Expected an API-key provider.");
	}
	return {
		provider: flags.provider,
		credential: { source: "env" as const, env },
	};
}

function parseArgs(
	args: string[]
): { ok: true; flags: ParsedFlags } | { ok: false; error: string } {
	const [command, ...rest] = args;
	if (command !== "generate" && command !== "models") {
		return { ok: false, error: "Missing command." };
	}

	const parsedFlags = readFlags(rest);
	if (!parsedFlags.ok) {
		return parsedFlags;
	}
	const flags = parsedFlags.flags;
	const provider = flags.provider;
	if (!isSmokeProvider(provider)) {
		return { ok: false, error: "Missing or invalid --provider." };
	}
	if ((provider === "ollama" || provider === "lm-studio") && flags.apiKey) {
		return { ok: false, error: `${provider} uses --url, not --api-key.` };
	}
	if (isSmokeCliProvider(provider) && flags.apiKey) {
		return { ok: false, error: `${provider} uses --executable, not --api-key.` };
	}
	if (provider !== "ollama" && provider !== "lm-studio" && flags.url) {
		return { ok: false, error: "Only local providers accept --url." };
	}
	if (!isSmokeCliProvider(provider) && flags.executable) {
		return { ok: false, error: "Only CLI providers accept --executable." };
	}
	if (command === "generate") {
		const model = flags.model;
		const input = flags.input;
		if (!model || !input) {
			return { ok: false, error: "Generate requires --model and --input." };
		}
		return {
			ok: true,
			flags: {
				command,
				provider,
				model,
				input,
				apiKey: flags.apiKey,
				url: flags.url,
				executable: flags.executable,
			},
		};
	}

	return {
		ok: true,
		flags: {
			command,
			provider,
			apiKey: flags.apiKey,
			url: flags.url,
			executable: flags.executable,
		},
	};
}

function readFlags(
	args: string[]
): { ok: true; flags: Record<string, string | undefined> } | { ok: false; error: string } {
	const flags: Record<string, string | undefined> = {};
	for (let index = 0; index < args.length; index += 2) {
		const name = args[index];
		const value = args[index + 1];
		if (!name?.startsWith("--") || value === undefined || value.startsWith("--")) {
			return { ok: false, error: "Every flag requires a value." };
		}
		flags[toCamelFlag(name.slice(2))] = value;
	}
	return { ok: true, flags };
}

function isSmokeProvider(provider: string | undefined): provider is SmokeProvider {
	return isByokProviderId(provider);
}

function isSmokeCliProvider(provider: SmokeProvider): provider is SmokeCliProvider {
	return byokProviderDefinition(provider).credentialKind === "command";
}

function isSmokeCloudProvider(provider: SmokeProvider): provider is SmokeCloudProvider {
	return byokProviderDefinition(provider).credentialKind === "api-key";
}

function toCamelFlag(name: string): string {
	return name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exitCode = await runProviderSmokeCli();
}
