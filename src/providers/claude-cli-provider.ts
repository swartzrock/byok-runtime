import {
	type AiProvider,
	ProviderError,
	type ProviderStatus,
	type TextGenerationInput,
	type TextGenerationOutput,
} from "./types";
import type { ByokModelOption } from "../types";
import {
	defaultLocalCliCwd,
	LocalCommandRunner,
	type LocalCommandRequest,
	type LocalCommandResult,
} from "./local-command-runner";
const DEFAULT_TIMEOUT_MS = 120_000;
const STATUS_TIMEOUT_MS = 15_000;
const CLAUDE_CLI_ENV: NodeJS.ProcessEnv = {
	CLAUDE_CODE_DISABLE_AGENT_VIEW: "1",
	CLAUDE_CODE_DISABLE_ARTIFACT: "1",
	CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
	CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: "1",
	CLAUDE_CODE_DISABLE_WORKFLOWS: "1",
	CLAUDE_CODE_SAFE_MODE: "1",
	CLAUDE_CODE_SKIP_PROMPT_HISTORY: "1",
	DISABLE_AUTOUPDATER: "1",
};
const CLAUDE_CLI_AUTH_MESSAGE =
	"Claude CLI is not authenticated. Run `claude auth login` in your terminal, then try again.";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

const CONNECTION_JSON_SCHEMA = JSON.stringify({
	type: "object",
	properties: {
		ok: { type: "boolean" },
	},
	required: ["ok"],
	additionalProperties: false,
});

type CommandRunner = Pick<LocalCommandRunner, "run">;

export interface ClaudeCliProviderOptions {
	command: string;
	model?: string;
	cwd?: string;
	timeoutMs?: number;
	runner?: CommandRunner;
	fetchImpl?: typeof fetch;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function textFromContent(value: unknown): string {
	if (typeof value === "string") return value;
	if (!Array.isArray(value)) return "";
	return value
		.map((item) => {
			if (typeof item === "string") return item;
			const record = asRecord(item);
			const text = record?.text;
			return typeof text === "string" ? text : "";
		})
		.filter(Boolean)
		.join("\n");
}

function looksLikeJson(value: string): boolean {
	return value.startsWith("{") || value.startsWith("[");
}

function normalizeClaudeText(value: string): string {
	const trimmed = value.trim();
	const quote = trimmed[0];
	if (
		trimmed.length < 2 ||
		(quote !== "'" && quote !== '"') ||
		trimmed[trimmed.length - 1] !== quote
	) {
		return value;
	}
	const inner = trimmed.slice(1, -1).trim();
	if (looksLikeJson(inner)) return inner;
	const unescaped = inner.replace(/\\"/g, '"');
	return looksLikeJson(unescaped) ? unescaped : value;
}

function textFromStructuredValue(value: unknown): string {
	if (typeof value === "string" && value.trim()) return normalizeClaudeText(value);
	if (value && typeof value === "object") return JSON.stringify(value);
	return "";
}

export function extractClaudeCliOutput(stdout: string): string {
	const trimmed = stdout.trim();
	if (!trimmed) return "";
	try {
		const parsed: unknown = JSON.parse(trimmed);
		const record = asRecord(parsed);
		if (!record) return stdout;
		for (const key of ["structured_output", "structuredOutput"]) {
			const value = textFromStructuredValue(record[key]);
			if (value.trim()) return value;
		}
		const result = record.result;
		const resultText = textFromStructuredValue(result);
		if (resultText.trim()) return resultText;
		for (const key of ["output", "response", "text", "message"]) {
			const value = record[key];
			if (typeof value === "string" && value.trim()) {
				return normalizeClaudeText(value);
			}
		}
		const content = textFromContent(record.content);
		if (content.trim()) return normalizeClaudeText(content);
	} catch {
		// The CLI may already have printed the model's raw final response.
	}
	return normalizeClaudeText(stdout);
}

function isAuthMissing(output: string): boolean {
	const normalized = output.toLowerCase();
	return (
		/not\s+(logged|authenticated)|unauthenticated|login required|no active account|failed to authenticate|invalid authentication credentials/i.test(
			output
		) ||
		(normalized.includes("401") && normalized.includes("authentic"))
	);
}

interface OpenRouterModelEntry {
	id?: unknown;
}

function normalizeClaudeCliModelId(model: string): string {
	return model
		.trim()
		.replace(/^~?anthropic\//, "")
		.split("-")
		.map((token) => (/^\d+(?:\.\d+)+$/.test(token) ? token.split(".").join("-") : token))
		.join("-");
}

function normalizeClaudeCliModelOverride(model: string): string {
	return normalizeClaudeCliModelId(model);
}

function modelOptionFromOpenRouterId(id: string): ByokModelOption | null {
	const trimmed = id.trim();
	const markerIndex = trimmed.indexOf("anthropic/");
	if (markerIndex === -1) return null;
	const claudeModelId = normalizeClaudeCliModelId(trimmed.slice(markerIndex + "anthropic/".length));
	if (claudeModelId.endsWith("-latest")) return null;
	return claudeModelId ? { id: claudeModelId, label: claudeModelId } : null;
}

function numericVersionToken(token: string): number[] | null {
	if (/^\d{8}$/.test(token)) return null;
	if (!/^\d+(?:\.\d+)*$/.test(token)) return null;
	return token.split(".").map((part) => Number(part));
}

function compareVersionParts(a: number[], b: number[]): number {
	const length = Math.max(a.length, b.length);
	for (let i = 0; i < length; i++) {
		const diff = (a[i] ?? 0) - (b[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

function modelFamilyAndVersion(id: string): {
	family: string;
	version: number[];
} {
	const familyTokens: string[] = [];
	const version: number[] = [];
	for (const token of id.split("-")) {
		const tokenVersion = numericVersionToken(token);
		if (tokenVersion) {
			version.push(...tokenVersion);
			continue;
		}
		if (/^\d{8}$/.test(token)) continue;
		familyTokens.push(token);
	}
	return {
		family: familyTokens.join("-") || id,
		version,
	};
}

function keepLatestClaudeModelVersions(options: ByokModelOption[]): ByokModelOption[] {
	const order: string[] = [];
	const bestByFamily = new Map<string, { option: ByokModelOption; version: number[] }>();
	for (const option of options) {
		const model = modelFamilyAndVersion(option.id);
		const existing = bestByFamily.get(model.family);
		if (!existing) {
			order.push(model.family);
			bestByFamily.set(model.family, { option, version: model.version });
			continue;
		}
		if (compareVersionParts(model.version, existing.version) > 0) {
			bestByFamily.set(model.family, { option, version: model.version });
		}
	}
	return order
		.map((family) => bestByFamily.get(family)?.option)
		.filter((option): option is ByokModelOption => option != null);
}

function extractOpenRouterAnthropicModels(body: unknown): ByokModelOption[] {
	const record = asRecord(body);
	const data = record?.data;
	if (!Array.isArray(data)) return [];
	const options: ByokModelOption[] = [];
	const seen = new Set<string>();
	for (const entry of data as OpenRouterModelEntry[]) {
		if (!entry || typeof entry.id !== "string") continue;
		const option = modelOptionFromOpenRouterId(entry.id);
		if (!option || seen.has(option.id)) continue;
		seen.add(option.id);
		options.push(option);
	}
	return keepLatestClaudeModelVersions(options);
}

export class ClaudeCliProvider implements AiProvider {
	readonly id = "claude-cli";
	readonly label = "Claude CLI";
	readonly requiresNetwork = true;
	readonly requiresDownload = false;

	private readonly command: string;
	private readonly model: string;
	private readonly cwd?: string;
	private readonly timeoutMs: number;
	private readonly runner: CommandRunner;
	private readonly fetchImpl?: typeof fetch;

	constructor(opts: ClaudeCliProviderOptions) {
		this.command = opts.command.trim() || "claude";
		this.model = normalizeClaudeCliModelOverride(opts.model ?? "");
		this.cwd = opts.cwd ?? defaultLocalCliCwd();
		this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.runner = opts.runner ?? new LocalCommandRunner();
		this.fetchImpl = opts.fetchImpl;
	}

	async testConnection(): Promise<ProviderStatus> {
		try {
			const output = await this.runPrompt(
				'Return exactly this JSON object to confirm Claude CLI text generation works: {"ok":true}',
				CONNECTION_JSON_SCHEMA,
				STATUS_TIMEOUT_MS
			);
			const parsed = asRecord(JSON.parse(output));
			if (parsed?.ok !== true) {
				return {
					ok: false,
					message: "Claude CLI connected but returned an unexpected setup response.",
				};
			}
			return {
				ok: true,
				message: this.model
					? `Connected to Claude CLI (${this.model}).`
					: "Connected to Claude CLI.",
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (isAuthMissing(message)) {
				return {
					ok: false,
					message: CLAUDE_CLI_AUTH_MESSAGE,
				};
			}
			return { ok: false, message };
		}
	}

	async generateText(
		input: TextGenerationInput,
		signal?: AbortSignal
	): Promise<TextGenerationOutput> {
		return {
			text: await this.complete(input.prompt, input.jsonSchema, signal),
		};
	}

	async listModels(): Promise<ByokModelOption[]> {
		const fetchFn = this.fetchImpl ?? globalThis.fetch;
		if (!fetchFn) {
			throw new ProviderError("Claude CLI model fetch requires a fetch implementation.");
		}
		let response: Response;
		try {
			response = await fetchFn(OPENROUTER_MODELS_URL, { method: "GET" });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new ProviderError(`Claude CLI model fetch failed: ${message}`);
		}
		if (!response.ok) {
			const detail = (await response.text()).trim();
			throw new ProviderError(
				detail
					? `Claude CLI model fetch failed (${response.status}): ${detail}`
					: `Claude CLI model fetch failed (${response.status}).`
			);
		}
		return extractOpenRouterAnthropicModels(await response.json());
	}

	private commandArgs(schema?: string): string[] {
		const args = [
			"-p",
			"--output-format",
			"json",
			"--input-format",
			"text",
			"--no-session-persistence",
			"--no-chrome",
			"--safe-mode",
			"--setting-sources",
			"user",
			"--permission-mode",
			"dontAsk",
			"--tools",
			"",
		];
		if (schema) args.push("--json-schema", schema);
		if (this.model) args.push("--model", this.model);
		return args;
	}

	private async runPrompt(
		prompt: string,
		schema?: string,
		timeoutMs = this.timeoutMs,
		signal?: AbortSignal
	): Promise<string> {
		const request: LocalCommandRequest = {
			command: this.command,
			args: this.commandArgs(schema),
			stdin: prompt,
			cwd: this.cwd,
			env: CLAUDE_CLI_ENV,
			timeoutMs,
			signal,
		};
		let result: LocalCommandResult;
		try {
			result = await this.runner.run(request);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (isAuthMissing(message)) {
				throw new ProviderError(CLAUDE_CLI_AUTH_MESSAGE);
			}
			if (error instanceof ProviderError) throw error;
			throw new ProviderError(`Claude CLI request failed: ${message}`);
		}
		const stdout = extractClaudeCliOutput(result.stdout);
		const stderr = extractClaudeCliOutput(result.stderr);
		const output = stdout.trim() ? stdout : stderr;
		if (isAuthMissing(result.stdout) || isAuthMissing(result.stderr) || isAuthMissing(output)) {
			throw new ProviderError(CLAUDE_CLI_AUTH_MESSAGE);
		}
		if (!output.trim()) {
			throw new ProviderError("Claude CLI returned an empty response.");
		}
		return output;
	}

	private async complete(prompt: string, schema?: string, signal?: AbortSignal): Promise<string> {
		return this.runPrompt(prompt, schema, this.timeoutMs, signal);
	}
}
