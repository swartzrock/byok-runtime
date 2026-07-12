import { pathToFileURL } from "node:url";
import { parseArgs as parseNodeArgs } from "node:util";
import {
	byokProviderDefinition,
	generateText,
	isByokProviderId,
	listModels,
	type ByokCliProviderId,
	type ByokCliProviderConfig,
	type ByokCloudProviderId,
	type ByokEnvironment,
	type ByokListModelsOptions,
	type ByokProviderId,
} from "../../../src";
import { createByokNodeProvider, findAvailableProviders } from "../../../src/node";

const CLI_PROVIDER_COMMANDS: Record<ByokCliProviderId, string> = {
	"codex-cli": "codex",
	"claude-cli": "claude",
};

interface SmokeByok {
	generateText: typeof generateText;
	listModels: typeof listModels;
}

interface RunProviderSmokeCliOptions {
	env?: ByokEnvironment;
	stdout?: (line: string) => void;
	stderr?: (line: string) => void;
	byok?: SmokeByok;
	createNodeProvider?: typeof createByokNodeProvider;
	findProviders?: typeof findAvailableProviders;
}

interface ParsedDetectFlags {
	command: "detect";
}

interface ParsedBaseFlags {
	provider: ByokProviderId;
}

interface ParsedGenerateFlags extends ParsedBaseFlags {
	command: "generate";
	model: string;
	input: string;
}

interface ParsedModelsFlags extends ParsedBaseFlags {
	command: "models";
}

type ParsedProviderFlags = ParsedGenerateFlags | ParsedModelsFlags;
type ParsedFlags = ParsedDetectFlags | ParsedProviderFlags;

const USAGE = `Usage:
	bun run provider-smoke detect
  bun run provider-smoke models --provider <provider>
  bun run provider-smoke generate --provider <provider> --model <model> --input <text>

Providers: anthropic, openai, google, xai, openrouter, ollama, lm-studio, codex-cli, claude-cli`;

export async function runProviderSmokeCli(
	args: string[] = process.argv.slice(2),
	options: RunProviderSmokeCliOptions = {}
): Promise<number> {
	const stderr = options.stderr ?? console.error;
	const stdout = options.stdout ?? console.log;
	const byok = options.byok ?? { generateText, listModels };
	const createNodeProvider = options.createNodeProvider ?? createByokNodeProvider;
	const findProviders = options.findProviders ?? findAvailableProviders;
	const env = options.env ?? process.env;
	const parsed = parseCliArgs(args);

	if (!parsed.ok) {
		stderr(parsed.error);
		stderr(USAGE);
		return 1;
	}

	try {
		if (parsed.flags.command === "detect") {
			for (const provider of await findProviders({ env })) {
				stdout(provider);
			}
			return 0;
		}

		if (parsed.flags.command === "models") {
			const models = isSmokeCliProvider(parsed.flags.provider)
				? await createNodeProvider(cliProviderConfig(parsed.flags)).listModels()
				: await byok.listModels(providerConfig(parsed.flags.provider, env));
			for (const model of models) {
				stdout(model.id);
			}
			return 0;
		}

		if (isSmokeCliProvider(parsed.flags.provider)) {
			const provider = createNodeProvider(cliProviderConfig(parsed.flags));
			const result = await provider.generateText({ prompt: parsed.flags.input });
			stdout(result.text);
			return 0;
		}

		const result = await byok.generateText({
			...providerConfig(parsed.flags.provider, env),
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

function cliProviderConfig(flags: ParsedProviderFlags): ByokCliProviderConfig {
	if (!isSmokeCliProvider(flags.provider)) {
		throw new Error("Expected a CLI provider.");
	}
	return {
		provider: flags.provider,
		command: CLI_PROVIDER_COMMANDS[flags.provider],
		...(flags.command === "generate" ? { model: flags.model } : {}),
	};
}

function providerConfig(provider: ByokProviderId, env: ByokEnvironment): ByokListModelsOptions {
	if (provider === "ollama" || provider === "lm-studio") {
		return { provider };
	}
	if (!isSmokeCloudProvider(provider)) {
		throw new Error("Expected an API-key provider.");
	}
	return {
		provider,
		credential: { source: "env" as const, env },
	};
}

function parseCliArgs(
	args: string[]
): { ok: true; flags: ParsedFlags } | { ok: false; error: string } {
	const [command, ...rest] = args;
	if (command === "detect") {
		return rest.length === 0
			? { ok: true, flags: { command } }
			: { ok: false, error: "Detect does not accept options." };
	}
	if (command !== "generate" && command !== "models") {
		return { ok: false, error: "Missing command." };
	}

	let values;
	try {
		({ values } = parseNodeArgs({
			args: rest,
			options: {
				provider: { type: "string" },
				model: { type: "string" },
				input: { type: "string" },
			},
			strict: true,
		}));
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}

	const provider = values.provider;
	if (!isByokProviderId(provider)) {
		return { ok: false, error: "Missing or invalid --provider." };
	}
	if (command === "generate") {
		const model = values.model;
		const input = values.input;
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
			},
		};
	}

	return {
		ok: true,
		flags: {
			command,
			provider,
		},
	};
}

function isSmokeCliProvider(provider: ByokProviderId): provider is ByokCliProviderId {
	return byokProviderDefinition(provider).credentialKind === "command";
}

function isSmokeCloudProvider(provider: ByokProviderId): provider is ByokCloudProviderId {
	return byokProviderDefinition(provider).credentialKind === "api-key";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exitCode = await runProviderSmokeCli();
}
