#!/usr/bin/env bun

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PINNED_LLAMA_RUNTIME = Object.freeze({
	release: "b10369",
	commit: "6e62ba538478202094edc6c100c782719e310aa3",
	archiveName: "llama-b10369-bin-macos-arm64.tar.gz",
	archiveBytes: 11_069_404,
	archiveSha256: "de2ac2c0a7cc245bce2411393658ff19c9c00d9d1fe37c5dfe94668c0d7bc01f",
	archiveUrl:
		"https://github.com/ggml-org/llama.cpp/releases/download/b10369/llama-b10369-bin-macos-arm64.tar.gz",
	bundleDirectory: "llama-b10369",
	expectedVersion: "version: 10369 (6e62ba538)",
});

const REQUIRED_BUNDLE_ENTRIES = Object.freeze([
	"llama-b10369/llama-server",
	"llama-b10369/LICENSE",
	"llama-b10369/libllama-server-impl.dylib",
	"llama-b10369/libllama-common.0.0.10369.dylib",
	"llama-b10369/libllama.0.0.10369.dylib",
	"llama-b10369/libggml.0.19.0.dylib",
	"llama-b10369/libggml-base.0.19.0.dylib",
	"llama-b10369/libggml-cpu.0.19.0.dylib",
	"llama-b10369/libggml-metal.0.19.0.dylib",
]);

export interface ManagedLocalRuntimeSmokeOptions {
	archivePath: string | undefined;
	keepWorkDirectory: boolean;
	modelPath: string | undefined;
}

export interface ManagedLocalRuntimeSmokeReport {
	archive: {
		bytes: number;
		name: string;
		sha256: string;
		url: string;
	};
	bundle: {
		complete: boolean;
		separatedExecutableFailed: boolean;
	};
	commit: string;
	gatekeeper: {
		accepted: boolean;
		assessment: string;
		quarantine: string;
	};
	notarization: {
		accepted: boolean;
		assessment: string;
	};
	host: {
		architecture: string;
		macOS: string;
	};
	modelLoad: "not-requested" | "authenticated-ready";
	release: string;
	signing: {
		details: string;
		strictVerificationPassed: boolean;
	};
	version: string;
	workDirectory: string | null;
}

interface CommandResult {
	status: number | null;
	stderr: string;
	stdout: string;
}

const HELP = `Usage:
  bun run scripts/managed-local-runtime-smoke.ts [options]

Options:
  --archive PATH          Use an existing pinned archive instead of downloading it.
  --model PATH            Opt into authenticated loading of an existing local GGUF.
  --keep-work-directory   Preserve the system temporary directory for inspection.
  -h, --help              Show this help message.

The script downloads only the pinned llama.cpp runtime when --archive is omitted.
It never downloads a model and never stores runtime or model assets in the repository.`;

export function parseManagedLocalRuntimeSmokeArgs(
	args: readonly string[]
): ManagedLocalRuntimeSmokeOptions {
	const options: ManagedLocalRuntimeSmokeOptions = {
		archivePath: undefined,
		keepWorkDirectory: false,
		modelPath: undefined,
	};

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--keep-work-directory") {
			options.keepWorkDirectory = true;
			continue;
		}
		if (argument === "--archive" || argument === "--model") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error(`${argument} requires a path.`);
			}
			if (argument === "--archive") {
				options.archivePath = resolve(value);
			} else {
				options.modelPath = resolve(value);
			}
			index += 1;
			continue;
		}
		throw new Error(`Unknown option '${argument}'.`);
	}

	return options;
}

export async function verifyRuntimeArchive(
	archivePath: string
): Promise<{ bytes: number; sha256: string }> {
	const archiveStat = await stat(archivePath);
	if (!archiveStat.isFile()) {
		throw new Error(`runtime archive is not a file: ${archivePath}`);
	}
	if (archiveStat.size !== PINNED_LLAMA_RUNTIME.archiveBytes) {
		throw new Error(
			`runtime archive size mismatch: expected ${PINNED_LLAMA_RUNTIME.archiveBytes}, received ${archiveStat.size}`
		);
	}

	const digest = createHash("sha256");
	for await (const chunk of createReadStream(archivePath)) {
		digest.update(chunk as Buffer);
	}
	const sha256 = digest.digest("hex");
	if (sha256 !== PINNED_LLAMA_RUNTIME.archiveSha256) {
		throw new Error(
			`runtime archive digest mismatch: expected ${PINNED_LLAMA_RUNTIME.archiveSha256}, received ${sha256}`
		);
	}

	return { bytes: archiveStat.size, sha256 };
}

export function assertCompleteRuntimeBundle(entries: readonly string[]): void {
	const entrySet = new Set(entries.map((entry) => entry.replace(/^\.\//, "").replace(/\/$/, "")));
	const missing = REQUIRED_BUNDLE_ENTRIES.filter((entry) => !entrySet.has(entry));
	if (missing.length > 0) {
		throw new Error(`runtime archive is incomplete; missing: ${missing.join(", ")}`);
	}
}

function runCommand(command: string, args: readonly string[], timeout = 30_000): CommandResult {
	const result = spawnSync(command, args, {
		encoding: "utf8",
		timeout,
	});
	if (result.error) {
		throw result.error;
	}
	return {
		status: result.status,
		stderr: result.stderr ?? "",
		stdout: result.stdout ?? "",
	};
}

function requireCommandSuccess(label: string, result: CommandResult): CommandResult {
	if (result.status !== 0) {
		const detail = [result.stdout, result.stderr]
			.map((text) => text.trim())
			.filter(Boolean)
			.join("\n");
		throw new Error(`${label} failed${detail ? `:\n${detail}` : ""}`);
	}
	return result;
}

async function downloadPinnedArchive(destination: string): Promise<void> {
	const result = runCommand(
		"/usr/bin/curl",
		[
			"--fail",
			"--location",
			"--proto",
			"=https",
			"--proto-redir",
			"=https",
			"--max-redirs",
			"5",
			"--silent",
			"--show-error",
			"--output",
			destination,
			PINNED_LLAMA_RUNTIME.archiveUrl,
		],
		120_000
	);
	requireCommandSuccess("runtime download", result);
}

async function readMacOSVersion(): Promise<string> {
	return requireCommandSuccess(
		"macOS version inspection",
		runCommand("/usr/bin/sw_vers", ["-productVersion"])
	).stdout.trim();
}

async function reserveLoopbackPort(): Promise<number> {
	const server = createServer();
	return new Promise((resolvePort, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close();
				reject(new Error("failed to reserve a loopback port"));
				return;
			}
			server.close((error) => {
				if (error) reject(error);
				else resolvePort(address.port);
			});
		});
	});
}

async function fetchWithDeadline(url: string, apiKey?: string): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 2_000);
	try {
		return await fetch(url, {
			headers: apiKey ? { authorization: `Bearer ${apiKey}` } : undefined,
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timer);
	}
}

async function stopChild(child: ReturnType<typeof spawn>): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) return;
	child.kill("SIGTERM");
	const exited = new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
	const timedOut = new Promise<"timeout">((resolveTimeout) =>
		setTimeout(() => resolveTimeout("timeout"), 5_000)
	);
	if ((await Promise.race([exited, timedOut])) === "timeout") {
		child.kill("SIGKILL");
		await exited;
	}
}

async function runAuthenticatedModelLoad(
	executablePath: string,
	modelPath: string,
	workDirectory: string
): Promise<void> {
	const modelStat = await stat(modelPath);
	if (!modelStat.isFile()) throw new Error(`model is not a file: ${modelPath}`);

	const port = await reserveLoopbackPort();
	const apiKey = randomBytes(32).toString("hex");
	const apiKeyPath = join(workDirectory, "smoke-api-key");
	await writeFile(apiKeyPath, `${apiKey}\n`, { mode: 0o600 });

	const child = spawn(
		executablePath,
		[
			"--model",
			modelPath,
			"--host",
			"127.0.0.1",
			"--port",
			String(port),
			"--alias",
			"byok-runtime-smoke",
			"--api-key-file",
			apiKeyPath,
			"--ctx-size",
			"512",
			"--offline",
			"--no-webui",
			"--no-slots",
		],
		{
			cwd: dirname(executablePath),
			env: {
				PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
				TMPDIR: workDirectory,
			},
			stdio: ["ignore", "pipe", "pipe"],
		}
	);

	let diagnostics = "";
	const capture = (chunk: Buffer) => {
		diagnostics = `${diagnostics}${chunk.toString("utf8")}`.slice(-65_536);
	};
	child.stdout.on("data", capture);
	child.stderr.on("data", capture);

	const deadline = Date.now() + 120_000;
	try {
		while (Date.now() < deadline) {
			if (child.exitCode !== null || child.signalCode !== null) {
				throw new Error(`llama-server exited before readiness:\n${diagnostics}`);
			}
			try {
				const health = await fetchWithDeadline(`http://127.0.0.1:${port}/health`);
				if (health.ok) {
					const unauthenticated = await fetchWithDeadline(`http://127.0.0.1:${port}/v1/models`);
					if (unauthenticated.status !== 401) {
						throw new Error(
							`expected unauthenticated /v1/models to return 401, received ${unauthenticated.status}`
						);
					}
					const authenticated = await fetchWithDeadline(
						`http://127.0.0.1:${port}/v1/models`,
						apiKey
					);
					if (authenticated.ok) {
						const payload = (await authenticated.json()) as { data?: Array<{ id?: string }> };
						if (payload.data?.some((model) => model.id === "byok-runtime-smoke")) return;
					}
				}
			} catch (error) {
				if (error instanceof Error && error.message.startsWith("expected unauthenticated"))
					throw error;
			}
			await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
		}
		throw new Error(`llama-server did not become ready before the deadline:\n${diagnostics}`);
	} finally {
		await stopChild(child);
		await rm(apiKeyPath, { force: true });
	}
}

export async function runManagedLocalRuntimeSmoke(
	options: ManagedLocalRuntimeSmokeOptions
): Promise<ManagedLocalRuntimeSmokeReport> {
	if (process.platform !== "darwin" || process.arch !== "arm64") {
		throw new Error(
			`unsupported host ${process.platform}/${process.arch}; this release gate requires macOS arm64`
		);
	}

	const workDirectory = await mkdtemp(join(tmpdir(), "byok-runtime-smoke-"));
	try {
		const archivePath =
			options.archivePath ?? join(workDirectory, PINNED_LLAMA_RUNTIME.archiveName);
		if (!options.archivePath) await downloadPinnedArchive(archivePath);
		const archiveIdentity = await verifyRuntimeArchive(archivePath);

		const entriesResult = requireCommandSuccess(
			"runtime archive listing",
			runCommand("/usr/bin/tar", ["-tzf", archivePath])
		);
		assertCompleteRuntimeBundle(entriesResult.stdout.split("\n").filter(Boolean));

		const extractionDirectory = join(workDirectory, "runtime");
		await mkdir(extractionDirectory);
		requireCommandSuccess(
			"runtime extraction",
			runCommand("/usr/bin/tar", ["-xzf", archivePath, "-C", extractionDirectory])
		);
		const bundleDirectory = join(extractionDirectory, PINNED_LLAMA_RUNTIME.bundleDirectory);
		const executablePath = join(bundleDirectory, "llama-server");

		const quarantine = `0083;${Math.floor(Date.now() / 1000).toString(16)};byok-runtime-smoke;${PINNED_LLAMA_RUNTIME.archiveUrl}`;
		requireCommandSuccess(
			"quarantine application",
			runCommand("/usr/bin/xattr", [
				"-r",
				"-w",
				"com.apple.quarantine",
				quarantine,
				bundleDirectory,
			])
		);
		const quarantineResult = requireCommandSuccess(
			"quarantine inspection",
			runCommand("/usr/bin/xattr", ["-p", "com.apple.quarantine", executablePath])
		).stdout.trim();

		const signingDetailsResult = runCommand("/usr/bin/codesign", [
			"--display",
			"--verbose=4",
			executablePath,
		]);
		const signingDetails = `${signingDetailsResult.stdout}${signingDetailsResult.stderr}`.trim();
		const strictVerification = runCommand("/usr/bin/codesign", [
			"--verify",
			"--deep",
			"--strict",
			"--verbose=4",
			executablePath,
		]);
		const gatekeeper = runCommand("/usr/sbin/spctl", [
			"--assess",
			"--type",
			"execute",
			"--verbose=4",
			executablePath,
		]);
		const gatekeeperAssessment = `${gatekeeper.stdout}${gatekeeper.stderr}`.trim();
		const notarization = runCommand("/usr/bin/codesign", [
			"-vvvv",
			"-R=notarized",
			"--check-notarization",
			executablePath,
		]);
		const notarizationAssessment = `${notarization.stdout}${notarization.stderr}`.trim();

		const versionResult = requireCommandSuccess(
			"quarantined llama-server execution",
			runCommand(executablePath, ["--version"])
		);
		const version = `${versionResult.stdout}${versionResult.stderr}`.trim();
		if (!version.includes(PINNED_LLAMA_RUNTIME.expectedVersion)) {
			throw new Error(
				`runtime version mismatch: expected '${PINNED_LLAMA_RUNTIME.expectedVersion}', received '${version}'`
			);
		}

		const separatedDirectory = join(workDirectory, "separated");
		const separatedExecutable = join(separatedDirectory, "llama-server");
		await mkdir(separatedDirectory);
		await copyFile(executablePath, separatedExecutable);
		await chmod(separatedExecutable, 0o755);
		const separatedResult = runCommand(separatedExecutable, ["--version"]);
		if (separatedResult.status === 0) {
			throw new Error("separated llama-server unexpectedly ran without its sibling libraries");
		}

		if (options.modelPath) {
			await runAuthenticatedModelLoad(executablePath, options.modelPath, workDirectory);
		}

		const report: ManagedLocalRuntimeSmokeReport = {
			archive: {
				bytes: archiveIdentity.bytes,
				name: PINNED_LLAMA_RUNTIME.archiveName,
				sha256: archiveIdentity.sha256,
				url: PINNED_LLAMA_RUNTIME.archiveUrl,
			},
			bundle: {
				complete: true,
				separatedExecutableFailed: true,
			},
			commit: PINNED_LLAMA_RUNTIME.commit,
			gatekeeper: {
				accepted: gatekeeper.status === 0,
				assessment: gatekeeperAssessment,
				quarantine: quarantineResult,
			},
			host: {
				architecture: process.arch,
				macOS: await readMacOSVersion(),
			},
			modelLoad: options.modelPath ? "authenticated-ready" : "not-requested",
			notarization: {
				accepted: notarization.status === 0,
				assessment: notarizationAssessment,
			},
			release: PINNED_LLAMA_RUNTIME.release,
			signing: {
				details: signingDetails,
				strictVerificationPassed: strictVerification.status === 0,
			},
			version,
			workDirectory: options.keepWorkDirectory ? workDirectory : null,
		};

		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		if (!report.gatekeeper.accepted || !report.notarization.accepted) {
			throw new Error(
				"Gatekeeper or notarization assessment rejected the pinned upstream executable; use a Developer ID signed and notarized fallback asset"
			);
		}
		return report;
	} finally {
		if (!options.keepWorkDirectory) await rm(workDirectory, { force: true, recursive: true });
	}
}

async function main(args: readonly string[]): Promise<number> {
	if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
		process.stdout.write(`${HELP}\n`);
		return 0;
	}
	try {
		await runManagedLocalRuntimeSmoke(parseManagedLocalRuntimeSmokeArgs(args));
		return 0;
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
	process.exitCode = await main(process.argv.slice(2));
}
