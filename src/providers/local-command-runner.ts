import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import type { Readable, Writable } from "node:stream";
import { ProviderError } from "./types";

const DEFAULT_TIMEOUT_MS = 60_000;
const STDERR_EXCERPT_CHARS = 400;
const LOGIN_SHELL_PATH_TIMEOUT_MS = 3_000;
const LOGIN_SHELL_PATH_MARKER = "__CUECRAFT_LOGIN_SHELL_PATH__";
let cachedLoginShellPath: string | undefined;
let pendingLoginShellPath: Promise<string> | null = null;

export interface LocalCommandRequest {
	command: string;
	args?: string[];
	stdin?: string;
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	timeoutMs?: number;
	signal?: AbortSignal;
}

export interface LocalCommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export interface LocalProcess {
	stdout: Readable;
	stderr: Readable;
	stdin: Writable;
	once(event: "close", listener: (code: number | null) => void): this;
	once(event: "error", listener: (error: NodeJS.ErrnoException) => void): this;
	kill(signal?: NodeJS.Signals): boolean;
}

export type LocalProcessSpawner = (
	command: string,
	args: string[],
	options: { cwd?: string; shell: false; env?: NodeJS.ProcessEnv }
) => LocalProcess;

type LocalCommandLogger = Pick<Console, "warn">;

export type LoginShellPathLoader = (env: NodeJS.ProcessEnv) => string | Promise<string>;

function defaultSpawner(
	command: string,
	args: string[],
	options: { cwd?: string; shell: false; env?: NodeJS.ProcessEnv }
): LocalProcess {
	return spawn(command, args, {
		cwd: options.cwd,
		env: options.env,
		shell: options.shell,
		stdio: ["pipe", "pipe", "pipe"],
	});
}

function commandLabel(command: string): string {
	return command.trim() || "local command";
}

function excerpt(value: string): string {
	const cleaned = value.trim().replace(/\s+/g, " ");
	return cleaned.length > STDERR_EXCERPT_CHARS
		? `${cleaned.slice(0, STDERR_EXCERPT_CHARS)}...`
		: cleaned;
}

function errorMessageForExit(
	command: string,
	code: number | null,
	stderr: string,
	stdout = ""
): string {
	const output = stderr.trim() || stdout.trim();
	const suffix = output ? `: ${excerpt(output)}` : ".";
	return `${commandLabel(command)} exited with code ${code ?? "unknown"}${suffix}`;
}

function errorMessageForSpawn(command: string, error: NodeJS.ErrnoException): string {
	if (error.code === "ENOENT") {
		return `${commandLabel(command)} was not found. Check the command path supplied by the host app.`;
	}
	return error.message
		? `${commandLabel(command)} failed to start: ${error.message}`
		: `${commandLabel(command)} failed to start.`;
}

function isBareCommand(command: string): boolean {
	return !command.includes("/") && !command.includes("\\");
}

function pathSeparator(): string {
	return process.platform === "win32" ? ";" : ":";
}

function mergePathValues(...paths: string[]): string {
	const separator = pathSeparator();
	const entries = paths
		.flatMap((path) => path.split(separator))
		.map((entry) => entry.trim())
		.filter(Boolean);
	const seen = new Set<string>();
	const merged: string[] = [];
	for (const entry of entries) {
		if (seen.has(entry)) continue;
		seen.add(entry);
		merged.push(entry);
	}
	return merged.join(separator);
}

function parseLoginShellPath(stdout: string): string {
	const escapedMarker = LOGIN_SHELL_PATH_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const markerPattern = new RegExp(`${escapedMarker}([\\s\\S]*?)${escapedMarker}`, "g");
	let lastMatch = "";
	for (const match of stdout.matchAll(markerPattern)) {
		lastMatch = match[1].trim();
	}
	return lastMatch;
}

function defaultLoginShell(): string {
	if (process.env.SHELL?.trim()) return process.env.SHELL.trim();
	return process.platform === "darwin" ? "/bin/zsh" : "/bin/sh";
}

function defaultLoginShellPathLoader(env: NodeJS.ProcessEnv): Promise<string> {
	if (process.platform === "win32") return Promise.resolve("");
	if (cachedLoginShellPath !== undefined) {
		return Promise.resolve(cachedLoginShellPath);
	}
	if (pendingLoginShellPath) return pendingLoginShellPath;
	pendingLoginShellPath = new Promise((resolve) => {
		const shell = env.SHELL?.trim() || defaultLoginShell();
		const child = spawn(
			shell,
			["-l", "-c", `printf '\\n${LOGIN_SHELL_PATH_MARKER}%s${LOGIN_SHELL_PATH_MARKER}\\n' "$PATH"`],
			{
				env,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			}
		);
		let stdout = "";
		let settled = false;
		let timeout: ReturnType<typeof setTimeout> | null = null;
		const settle = (path: string): void => {
			if (settled) return;
			settled = true;
			if (timeout) clearTimeout(timeout);
			if (path) cachedLoginShellPath = path;
			pendingLoginShellPath = null;
			resolve(path);
		};

		child.stdout.on("data", (chunk: Buffer | string) => {
			stdout += chunk.toString();
		});
		child.once("error", () => settle(""));
		child.once("close", (code) => {
			settle(code === 0 ? parseLoginShellPath(stdout) : "");
		});
		timeout = setTimeout(() => {
			child.kill("SIGTERM");
			settle("");
		}, LOGIN_SHELL_PATH_TIMEOUT_MS);
	});
	return pendingLoginShellPath;
}

function resolveBareCommandPath(
	basePath: string,
	commandEnv: NodeJS.ProcessEnv,
	loadLoginShellPath: LoginShellPathLoader,
	logger: LocalCommandLogger
): string | Promise<string> {
	const loadedPath = loadLoginShellPath(commandEnv);
	const mergeLoadedPath = (loginShellPath: string): string =>
		mergePathValues(loginShellPath, basePath);
	if (typeof loadedPath === "string") return mergeLoadedPath(loadedPath);
	return loadedPath.then(mergeLoadedPath).catch((error: unknown) => {
		logger.warn("BYOK could not load login shell PATH", {
			message: error instanceof Error ? error.message : String(error),
		});
		return basePath;
	});
}

export function defaultLocalCliCwd(): string {
	return tmpdir();
}

export class LocalCommandRunner {
	constructor(
		private readonly spawnProcess: LocalProcessSpawner = defaultSpawner,
		private readonly env: NodeJS.ProcessEnv = process.env,
		private readonly logger: LocalCommandLogger = console,
		private readonly loadLoginShellPath: LoginShellPathLoader = defaultLoginShellPathLoader
	) {}

	run(request: LocalCommandRequest): Promise<LocalCommandResult> {
		const args = request.args ?? [];
		const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const basePath = request.env?.PATH ?? this.env.PATH ?? "";
		const commandEnv: NodeJS.ProcessEnv = {
			...this.env,
			...request.env,
		};
		if (request.signal?.aborted) {
			return Promise.reject(new ProviderError(`${commandLabel(request.command)} was cancelled.`));
		}

		const pathValue = isBareCommand(request.command)
			? resolveBareCommandPath(basePath, commandEnv, this.loadLoginShellPath, this.logger)
			: basePath;

		const runWithPath = (PATH: string): Promise<LocalCommandResult> => {
			if (request.signal?.aborted) {
				return Promise.reject(new ProviderError(`${commandLabel(request.command)} was cancelled.`));
			}
			commandEnv.PATH = PATH;
			return this.runWithEnv(request, args, timeoutMs, commandEnv);
		};

		return typeof pathValue === "string" ? runWithPath(pathValue) : pathValue.then(runWithPath);
	}

	private runWithEnv(
		request: LocalCommandRequest,
		args: string[],
		timeoutMs: number,
		commandEnv: NodeJS.ProcessEnv
	): Promise<LocalCommandResult> {
		return new Promise((resolve, reject) => {
			const child = this.spawnProcess(request.command, args, {
				cwd: request.cwd,
				env: commandEnv,
				shell: false,
			});
			let stdout = "";
			let stderr = "";
			let settled = false;
			let timeout: ReturnType<typeof setTimeout> | null = null;

			const settle = (callback: () => void, removeAbortListener: () => void): void => {
				if (settled) return;
				settled = true;
				if (timeout) clearTimeout(timeout);
				removeAbortListener();
				callback();
			};

			const onAbort = (): void => {
				child.kill("SIGTERM");
				settle(
					() => reject(new ProviderError(`${commandLabel(request.command)} was cancelled.`)),
					() => request.signal?.removeEventListener("abort", onAbort)
				);
			};

			request.signal?.addEventListener("abort", onAbort, { once: true });
			const removeAbortListener = (): void => request.signal?.removeEventListener("abort", onAbort);

			child.stdout.on("data", (chunk: Buffer | string) => {
				stdout += chunk.toString();
			});
			child.stderr.on("data", (chunk: Buffer | string) => {
				stderr += chunk.toString();
			});
			child.once("error", (error) => {
				settle(() => {
					this.logger.warn("BYOK local CLI failed to start", {
						command: request.command,
						code: error.code,
						PATH: commandEnv.PATH ?? "",
					});
					reject(new ProviderError(errorMessageForSpawn(request.command, error)));
				}, removeAbortListener);
			});
			child.once("close", (code) => {
				settle(() => {
					if (code === 0) {
						resolve({ stdout, stderr, exitCode: 0 });
						return;
					}
					reject(new ProviderError(errorMessageForExit(request.command, code, stderr, stdout)));
				}, removeAbortListener);
			});

			timeout = setTimeout(() => {
				child.kill("SIGTERM");
				settle(
					() =>
						reject(
							new ProviderError(`${commandLabel(request.command)} timed out after ${timeoutMs}ms.`)
						),
					removeAbortListener
				);
			}, timeoutMs);

			child.stdin.end(request.stdin ?? "");
		});
	}
}
