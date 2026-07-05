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

type CommandRunner = Pick<LocalCommandRunner, "run">;

export interface CodexCliProviderOptions {
	command: string;
	model?: string;
	cwd?: string;
	timeoutMs?: number;
	runner?: CommandRunner;
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

function textFromEvent(value: unknown): string {
	const record = asRecord(value);
	if (!record) return "";
	for (const key of ["result", "output", "final_output", "response", "text"]) {
		const text = record[key];
		if (typeof text === "string" && text.trim()) return text;
	}
	const content = textFromContent(record.content);
	if (content.trim()) return content;
	const message = record.message;
	if (typeof message === "string" && message.trim()) return message;
	const nested = textFromEvent(message);
	if (nested.trim()) return nested;
	const item = textFromEvent(record.item);
	return item.trim() ? item : "";
}

function optionFromCodexModel(value: unknown): ByokModelOption | null {
	if (typeof value === "string") {
		const id = value.trim();
		return id ? { id, label: id } : null;
	}
	const record = asRecord(value);
	if (!record) return null;
	const rawId = record.slug ?? record.id ?? record.name;
	if (typeof rawId !== "string") return null;
	const id = rawId.trim();
	if (!id) return null;
	return { id, label: id };
}

function dedupeModelOptions(options: ByokModelOption[]): ByokModelOption[] {
	const byId = new Map<string, ByokModelOption>();
	for (const option of options) {
		if (!byId.has(option.id)) byId.set(option.id, option);
	}
	return [...byId.values()];
}

export function extractCodexCliModels(stdout: string): ByokModelOption[] {
	const trimmed = stdout.trim();
	if (!trimmed) return [];
	try {
		const parsed: unknown = JSON.parse(trimmed);
		const modelList = Array.isArray(parsed)
			? parsed
			: (asRecord(parsed)?.models ?? asRecord(parsed)?.data);
		if (!Array.isArray(modelList)) return [];
		return dedupeModelOptions(
			modelList
				.map(optionFromCodexModel)
				.filter((option): option is ByokModelOption => option !== null)
		);
	} catch {
		return [];
	}
}

export function extractCodexCliOutput(stdout: string): string {
	const trimmed = stdout.trim();
	if (!trimmed) return "";
	const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
	if (lines.length > 1) {
		for (let i = lines.length - 1; i >= 0; i--) {
			try {
				const parsedLine: unknown = JSON.parse(lines[i]);
				const text = textFromEvent(parsedLine);
				if (text.trim()) return text;
			} catch {
				// Ignore non-JSON log lines.
			}
		}
	}
	try {
		const parsed: unknown = JSON.parse(trimmed);
		const text = textFromEvent(parsed);
		if (text.trim()) return text;
	} catch {
		// The CLI may already have printed the model's raw final response.
	}
	return stdout;
}

export class CodexCliProvider implements AiProvider {
	readonly id = "codex-cli";
	readonly label = "Codex CLI";
	readonly requiresNetwork = true;
	readonly requiresDownload = false;

	private readonly command: string;
	private readonly model: string;
	private readonly cwd?: string;
	private readonly timeoutMs: number;
	private readonly runner: CommandRunner;

	constructor(opts: CodexCliProviderOptions) {
		this.command = opts.command.trim() || "codex";
		this.model = opts.model?.trim() ?? "";
		this.cwd = opts.cwd ?? defaultLocalCliCwd();
		this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.runner = opts.runner ?? new LocalCommandRunner();
	}

	async testConnection(): Promise<ProviderStatus> {
		try {
			const result = await this.runner.run({
				command: this.command,
				args: ["login", "status"],
				cwd: this.cwd,
				timeoutMs: STATUS_TIMEOUT_MS,
			});
			const output = `${result.stdout}\n${result.stderr}`;
			if (/not\s+(logged|authenticated)|unauthenticated|login required/i.test(output)) {
				return {
					ok: false,
					message: "Codex CLI is not logged in. Run `codex login` and try again.",
				};
			}
			return {
				ok: true,
				message: this.model ? `Connected to Codex CLI (${this.model}).` : "Connected to Codex CLI.",
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { ok: false, message };
		}
	}

	async listModels(): Promise<ByokModelOption[]> {
		let result: LocalCommandResult;
		try {
			result = await this.runner.run({
				command: this.command,
				args: ["debug", "models"],
				cwd: this.cwd,
				timeoutMs: STATUS_TIMEOUT_MS,
			});
		} catch (error) {
			if (error instanceof ProviderError) throw error;
			const message = error instanceof Error ? error.message : String(error);
			throw new ProviderError(`Codex CLI model fetch failed: ${message}`);
		}
		return extractCodexCliModels(result.stdout);
	}

	async generateText(
		input: TextGenerationInput,
		signal?: AbortSignal
	): Promise<TextGenerationOutput> {
		return { text: await this.complete(input.prompt, signal) };
	}

	private commandArgs(): string[] {
		const args = ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "--json"];
		if (this.model) args.push("--model", this.model);
		return args;
	}

	private async complete(prompt: string, signal?: AbortSignal): Promise<string> {
		const request: LocalCommandRequest = {
			command: this.command,
			args: this.commandArgs(),
			stdin: prompt,
			cwd: this.cwd,
			timeoutMs: this.timeoutMs,
			signal,
		};
		let result: LocalCommandResult;
		try {
			result = await this.runner.run(request);
		} catch (error) {
			if (error instanceof ProviderError) throw error;
			const message = error instanceof Error ? error.message : String(error);
			throw new ProviderError(`Codex CLI request failed: ${message}`);
		}
		const output = extractCodexCliOutput(result.stdout);
		if (!output.trim()) {
			throw new ProviderError("Codex CLI returned an empty response.");
		}
		return output;
	}
}
