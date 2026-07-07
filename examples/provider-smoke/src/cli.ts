import { pathToFileURL } from "node:url";
import { generateText, listModels } from "../../../src";

const CLOUD_PROVIDERS = ["anthropic", "openai", "google", "xai", "openrouter"] as const;

type SmokeCloudProvider = (typeof CLOUD_PROVIDERS)[number];
type SmokeProvider = SmokeCloudProvider | "ollama";
type SmokeEnv = Readonly<Record<string, string | undefined>>;

interface SmokeByok {
	generateText: typeof generateText;
	listModels: typeof listModels;
}

interface RunProviderSmokeCliOptions {
	env?: SmokeEnv;
	stdout?: (line: string) => void;
	stderr?: (line: string) => void;
	byok?: SmokeByok;
}

interface ParsedBaseFlags {
	provider: SmokeProvider;
	apiKey?: string;
	url?: string;
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
  bun run provider-smoke models --provider <provider> [--api-key <key>] [--url <url>]
  bun run provider-smoke generate --provider <provider> --model <model> --input <text> [--api-key <key>] [--url <url>]

Providers: anthropic, openai, google, xai, openrouter, ollama`;

export async function runProviderSmokeCli(
	args: string[] = process.argv.slice(2),
	options: RunProviderSmokeCliOptions = {}
): Promise<number> {
	const stderr = options.stderr ?? console.error;
	const stdout = options.stdout ?? console.log;
	const byok = options.byok ?? { generateText, listModels };
	const env = options.env ?? process.env;
	const parsed = parseArgs(args);

	if (!parsed.ok) {
		stderr(parsed.error);
		stderr(USAGE);
		return 1;
	}

	try {
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

function providerConfig(flags: ParsedFlags, env: SmokeEnv) {
	if (flags.provider === "ollama") {
		return {
			provider: "ollama" as const,
			url: flags.url,
		};
	}
	if (flags.apiKey) {
		return {
			provider: flags.provider,
			apiKey: flags.apiKey,
		};
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

	const flags = readFlags(rest);
	const provider = flags.provider;
	if (!isSmokeProvider(provider)) {
		return { ok: false, error: "Missing or invalid --provider." };
	}
	if (provider === "ollama" && flags.apiKey) {
		return { ok: false, error: "Ollama uses --url, not --api-key." };
	}
	if (provider !== "ollama" && flags.url) {
		return { ok: false, error: "Only Ollama accepts --url." };
	}
	if (command === "generate" && (!flags.model || !flags.input)) {
		return { ok: false, error: "Generate requires --model and --input." };
	}

	if (command === "generate") {
		return {
			ok: true,
			flags: {
				command,
				provider,
				model: flags.model,
				input: flags.input,
				apiKey: flags.apiKey,
				url: flags.url,
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
		},
	};
}

function readFlags(args: string[]): Record<string, string | undefined> {
	const flags: Record<string, string | undefined> = {};
	for (let index = 0; index < args.length; index += 2) {
		const name = args[index];
		const value = args[index + 1];
		if (!name?.startsWith("--") || value === undefined || value.startsWith("--")) {
			return flags;
		}
		flags[toCamelFlag(name.slice(2))] = value;
	}
	return flags;
}

function isSmokeProvider(provider: string | undefined): provider is SmokeProvider {
	return (
		provider === "ollama" || CLOUD_PROVIDERS.some((cloudProvider) => cloudProvider === provider)
	);
}

function toCamelFlag(name: string): string {
	return name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exitCode = await runProviderSmokeCli();
}
