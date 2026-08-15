import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
	LocalCommandRunner,
	type LoginShellPathLoader,
	type LocalProcess,
	type LocalProcessSpawner,
} from "../src/providers/local-command-runner";
import { ProviderError } from "../src/providers/types";

class FakeProcess extends EventEmitter implements LocalProcess {
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();
	readonly stdin = new PassThrough();
	readonly killSignals: NodeJS.Signals[] = [];
	onKill?: (signal: NodeJS.Signals) => void;
	stdinText = "";

	constructor() {
		super();
		this.stdin.on("data", (chunk: Buffer | string) => {
			this.stdinText += chunk.toString();
		});
	}

	kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
		this.killSignals.push(signal);
		this.onKill?.(signal);
		return true;
	}

	close(code: number | null): void {
		this.emit("close", code);
	}

	fail(error: NodeJS.ErrnoException): void {
		this.emit("error", error);
	}
}

function makeRunner(
	process: FakeProcess,
	opts: {
		env?: NodeJS.ProcessEnv;
		loginShellPath?: string;
	} = {}
): {
	runner: LocalCommandRunner;
	calls: Array<Parameters<LocalProcessSpawner>>;
} {
	const calls: Array<Parameters<LocalProcessSpawner>> = [];
	const spawner: LocalProcessSpawner = (command, args, options) => {
		calls.push([command, args, options]);
		return process;
	};
	const loadLoginShellPath: LoginShellPathLoader = () => opts.loginShellPath ?? "";
	return {
		runner: new LocalCommandRunner(
			spawner,
			opts.env ?? { PATH: "/usr/bin" },
			console,
			loadLoginShellPath
		),
		calls,
	};
}

function observe(promise: Promise<unknown>): {
	completion: Promise<void>;
	isSettled: () => boolean;
	error: () => unknown;
} {
	let settled = false;
	let observedError: unknown;
	return {
		completion: promise.then(
			() => {
				settled = true;
			},
			(error: unknown) => {
				settled = true;
				observedError = error;
			}
		),
		isSettled: () => settled,
		error: () => observedError,
	};
}

describe("LocalCommandRunner", () => {
	it("uses the login shell PATH for bare commands", async () => {
		const process = new FakeProcess();
		const { runner, calls } = makeRunner(process, {
			loginShellPath: "/Users/jason/.local/bin:/usr/bin",
		});
		const result = runner.run({ command: "codex" });

		process.close(0);

		await expect(result).resolves.toMatchObject({ exitCode: 0 });
		expect(calls[0][2].env?.PATH).toBe("/Users/jason/.local/bin:/usr/bin");
		expect(calls[0][2].env?.PATH).not.toContain("/opt/homebrew/bin");
	});

	it("merges request-specific environment values", async () => {
		const process = new FakeProcess();
		const { runner, calls } = makeRunner(process, {
			loginShellPath: "/Users/jason/bin:/usr/bin",
		});
		const result = runner.run({
			command: "claude",
			env: { CLAUDE_CODE_SIMPLE: "1" },
		});

		process.close(0);

		await expect(result).resolves.toMatchObject({ exitCode: 0 });
		expect(calls[0][2].env).toMatchObject({
			CLAUDE_CODE_SIMPLE: "1",
			PATH: "/Users/jason/bin:/usr/bin",
		});
	});

	it("falls back to the app environment PATH when the login shell PATH is unavailable", async () => {
		const process = new FakeProcess();
		const { runner, calls } = makeRunner(process);
		const result = runner.run({ command: "codex" });

		process.close(0);

		await expect(result).resolves.toMatchObject({ exitCode: 0 });
		expect(calls[0][2].env?.PATH).toBe("/usr/bin");
	});

	it("leaves absolute command paths on the configured environment PATH", async () => {
		const process = new FakeProcess();
		const { runner, calls } = makeRunner(process);
		const result = runner.run({ command: "/Users/jason/.local/bin/claude" });

		process.close(0);

		await expect(result).resolves.toMatchObject({ exitCode: 0 });
		expect(calls[0][2].env?.PATH).toBe("/usr/bin");
	});

	it("returns stdout, stderr, and exit status for a successful process", async () => {
		const process = new FakeProcess();
		const { runner } = makeRunner(process);
		const result = runner.run({ command: "codex", args: ["exec"] });

		process.stdout.write('{"ok":true}');
		process.stderr.write("warning");
		process.close(0);

		await expect(result).resolves.toEqual({
			stdout: '{"ok":true}',
			stderr: "warning",
			exitCode: 0,
		});
	});

	it("maps nonzero exits to ProviderError with a stderr excerpt", async () => {
		const process = new FakeProcess();
		const { runner } = makeRunner(process);
		const result = runner.run({ command: "claude", args: ["-p"] });

		process.stderr.write("authentication failed because the session expired");
		process.close(2);

		await expect(result).rejects.toThrow(/claude exited with code 2: authentication failed/);
		await expect(result).rejects.toBeInstanceOf(ProviderError);
	});

	it("uses stdout as the nonzero-exit excerpt when stderr is empty", async () => {
		const process = new FakeProcess();
		const { runner } = makeRunner(process);
		const result = runner.run({ command: "claude", args: ["-p"] });

		process.stdout.write("Login required: run claude auth login");
		process.close(1);

		await expect(result).rejects.toThrow(/claude exited with code 1: Login required/);
	});

	it("terminates, waits for close, and reports cancellation when aborted", async () => {
		const process = new FakeProcess();
		const { runner } = makeRunner(process);
		const controller = new AbortController();
		const result = runner.run({
			command: "codex",
			args: ["exec"],
			signal: controller.signal,
		});
		const observed = observe(result);

		controller.abort();
		await Promise.resolve();

		expect(process.killSignals).toEqual(["SIGTERM"]);
		expect(observed.isSettled()).toBe(false);

		process.close(143);

		await observed.completion;
		expect(observed.error()).toBeInstanceOf(ProviderError);
		expect(observed.error()).toMatchObject({
			message: expect.stringMatching(/codex was cancelled/),
		});
	});

	it("force-kills a cancelled process that does not close after SIGTERM", async () => {
		vi.useFakeTimers();
		try {
			const process = new FakeProcess();
			const { runner } = makeRunner(process);
			const controller = new AbortController();
			const result = runner.run({ command: "codex", signal: controller.signal });
			const observed = observe(result);

			controller.abort();
			await vi.advanceTimersByTimeAsync(249);
			expect(process.killSignals).toEqual(["SIGTERM"]);

			await vi.advanceTimersByTimeAsync(1);
			expect(process.killSignals).toEqual(["SIGTERM", "SIGKILL"]);

			process.close(137);
			await observed.completion;
			expect(observed.error()).toMatchObject({
				message: expect.stringMatching(/codex was cancelled/),
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("keeps consuming child errors until an interrupted process closes", async () => {
		vi.useFakeTimers();
		try {
			const process = new FakeProcess();
			process.onKill = () => {
				const error = Object.assign(new Error("operation not permitted"), { code: "EPERM" });
				process.fail(error);
			};
			const { runner } = makeRunner(process);
			const controller = new AbortController();
			const observed = observe(runner.run({ command: "codex", signal: controller.signal }));

			controller.abort();
			await vi.advanceTimersByTimeAsync(250);

			expect(process.killSignals).toEqual(["SIGTERM", "SIGKILL"]);
			expect(observed.isSettled()).toBe(false);

			process.close(1);
			await observed.completion;
			expect(observed.error()).toMatchObject({
				message: expect.stringMatching(/codex was cancelled/),
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not force-kill a cancelled process that closes after SIGTERM", async () => {
		vi.useFakeTimers();
		try {
			const process = new FakeProcess();
			const { runner } = makeRunner(process);
			const controller = new AbortController();
			const observed = observe(runner.run({ command: "codex", signal: controller.signal }));

			controller.abort();
			process.close(143);
			await observed.completion;
			await vi.advanceTimersByTimeAsync(250);

			expect(process.killSignals).toEqual(["SIGTERM"]);
			expect(observed.error()).toMatchObject({
				message: expect.stringMatching(/codex was cancelled/),
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not spawn when the signal is already aborted", async () => {
		const process = new FakeProcess();
		const { runner, calls } = makeRunner(process);
		const controller = new AbortController();
		controller.abort();

		await expect(runner.run({ command: "codex", signal: controller.signal })).rejects.toThrow(
			/codex was cancelled/
		);
		expect(calls).toHaveLength(0);
	});

	it("does not spawn when aborted while loading the login shell PATH", async () => {
		const process = new FakeProcess();
		const calls: Array<Parameters<LocalProcessSpawner>> = [];
		const spawner: LocalProcessSpawner = (command, args, options) => {
			calls.push([command, args, options]);
			return process;
		};
		let resolvePath: (path: string) => void = () => {};
		const loadLoginShellPath: LoginShellPathLoader = () =>
			new Promise((resolve) => {
				resolvePath = resolve;
			});
		const runner = new LocalCommandRunner(
			spawner,
			{ PATH: "/usr/bin" },
			console,
			loadLoginShellPath
		);
		const controller = new AbortController();
		const result = runner.run({ command: "codex", signal: controller.signal });

		controller.abort();
		resolvePath("/Users/jason/bin:/usr/bin");

		await expect(result).rejects.toThrow(/codex was cancelled/);
		expect(calls).toHaveLength(0);
	});

	it("does not miss an abort while installing the process listener", async () => {
		const process = new FakeProcess();
		process.onKill = (signal) => {
			if (signal === "SIGTERM") queueMicrotask(() => process.close(143));
		};
		const { runner } = makeRunner(process);
		let abortedReads = 0;
		const signal = {
			get aborted() {
				abortedReads += 1;
				return abortedReads >= 3;
			},
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		} as unknown as AbortSignal;

		const result = runner.run({ command: "codex", signal });

		await expect(result).rejects.toThrow(/codex was cancelled/);
		expect(process.killSignals).toEqual(["SIGTERM"]);
	});

	it("terminates and waits for close when the command times out", async () => {
		vi.useFakeTimers();
		try {
			const process = new FakeProcess();
			const { runner } = makeRunner(process);
			const result = runner.run({
				command: "claude",
				args: ["-p"],
				timeoutMs: 1,
			});
			const observed = observe(result);

			await vi.advanceTimersByTimeAsync(1);
			expect(process.killSignals).toEqual(["SIGTERM"]);
			expect(observed.isSettled()).toBe(false);

			process.close(143);
			await observed.completion;
			expect(observed.error()).toMatchObject({
				message: expect.stringMatching(/claude timed out after 1ms/),
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("terminates and reaps the process when ending stdin throws", async () => {
		const process = new FakeProcess();
		process.stdin.end = (() => {
			throw new Error("broken pipe");
		}) as typeof process.stdin.end;
		process.onKill = (signal) => {
			if (signal === "SIGTERM") queueMicrotask(() => process.close(1));
		};
		const { runner } = makeRunner(process);

		const result = runner.run({ command: "codex", stdin: "prompt" });

		await expect(result).rejects.toThrow(/codex failed to receive input: broken pipe/);
		await expect(result).rejects.toBeInstanceOf(ProviderError);
		expect(process.killSignals).toEqual(["SIGTERM"]);
	});

	it("terminates and reaps the process when stdin emits an error", async () => {
		const process = new FakeProcess();
		const controller = new AbortController();
		process.onKill = (signal) => {
			if (signal === "SIGTERM") queueMicrotask(() => process.close(1));
		};
		const { runner } = makeRunner(process);
		const result = runner.run({
			command: "codex",
			stdin: "prompt",
			signal: controller.signal,
		});
		const observed = observe(result);

		process.stdin.emit("error", new Error("broken pipe"));
		controller.abort();

		await observed.completion;
		expect(observed.error()).toMatchObject({
			message: expect.stringMatching(/codex failed to receive input: broken pipe/),
		});
		expect(process.killSignals).toEqual(["SIGTERM"]);
	});

	it("maps missing commands to setup guidance", async () => {
		const process = new FakeProcess();
		const warn = vi.fn();
		const spawner: LocalProcessSpawner = () => process;
		const runner = new LocalCommandRunner(spawner, { PATH: "/usr/bin" }, { warn }, () => "");
		const result = runner.run({ command: "missing-codex" });

		process.fail(
			Object.assign(new Error("spawn missing-codex ENOENT"), {
				code: "ENOENT",
			})
		);

		await expect(result).rejects.toThrow(/missing-codex was not found.*command path/i);
		expect(warn).toHaveBeenCalledWith("BYOK local CLI failed to start", {
			command: "missing-codex",
			code: "ENOENT",
			hasPath: true,
		});
	});

	it("passes metacharacters as argv and stdin data without shell expansion", async () => {
		const process = new FakeProcess();
		const { runner, calls } = makeRunner(process);
		const model = "sonnet; rm -rf /";
		const prompt = "Explain $(touch should-not-run)";
		const result = runner.run({
			command: "claude",
			args: ["--model", model],
			stdin: prompt,
			cwd: "/tmp/byok-empty",
		});

		process.close(0);

		await expect(result).resolves.toMatchObject({ exitCode: 0 });
		expect(calls).toEqual([
			[
				"claude",
				["--model", model],
				{
					cwd: "/tmp/byok-empty",
					env: { PATH: "/usr/bin" },
					shell: false,
				},
			],
		]);
		expect(process.stdinText).toBe(prompt);
	});
});
