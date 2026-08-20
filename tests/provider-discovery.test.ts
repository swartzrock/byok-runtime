import { access, chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ByokTransport } from "../src";
import { findAvailableProviders } from "../src/node";

describe("findAvailableProviders", () => {
	it("returns detected providers in local, CLI, then API-key order", async () => {
		const urls: string[] = [];
		const transport = vi.fn<ByokTransport>(async (request) => {
			urls.push(request.url);
			return new Response("", { status: 200 });
		});
		const commandExists = vi.fn(async () => true);

		const providers = await findAvailableProviders(
			{
				env: {
					ANTHROPIC_API_KEY: "anthropic-test",
					OPENAI_API_KEY: "openai-test",
					GEMINI_API_KEY: "gemini-test",
					XAI_API_KEY: "xai-test",
					OPENROUTER_API_KEY: "openrouter-test",
					GROQ_API_KEY: "groq-test",
					MISTRAL_API_KEY: "mistral-test",
					DEEPSEEK_API_KEY: "deepseek-test",
					DEEPINFRA_TOKEN: "deepinfra-test",
					TOGETHER_API_KEY: "together-test",
					FIREWORKS_API_KEY: "fireworks-test",
				},
			},
			{ transport, commandExists }
		);

		expect(providers).toEqual([
			"ollama",
			"lm-studio",
			"codex-cli",
			"claude-cli",
			"anthropic",
			"openai",
			"google",
			"xai",
			"openrouter",
			"groq",
			"mistral",
			"deepseek",
			"deepinfra",
			"together",
			"fireworks",
		]);
		expect(transport).toHaveBeenCalledTimes(2);
		expect(urls).toEqual(["http://127.0.0.1:11434/api/tags", "http://127.0.0.1:1234/v1/models"]);
		expect(commandExists.mock.calls.map(([command]) => command)).toEqual(["codex", "claude"]);
	});

	it("treats failed probes as unavailable instead of throwing", async () => {
		const transport = vi.fn<ByokTransport>(async () => {
			throw new Error("server unavailable");
		});
		const commandExists = vi.fn(async () => {
			throw new Error("command lookup failed");
		});

		await expect(
			findAvailableProviders({ env: {} }, { transport, commandExists })
		).resolves.toEqual([]);
	});

	it("times out stalled HTTP probes", async () => {
		vi.useFakeTimers();
		try {
			const signals: AbortSignal[] = [];
			const transport = vi.fn<ByokTransport>(
				(request) =>
					new Promise<Response>((_resolve, reject) => {
						const signal = request.signal;
						signals.push(signal);
						signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
					})
			);
			const commandExists = vi.fn(async () => false);

			const discovery = findAvailableProviders({ env: {} }, { transport, commandExists });
			await vi.advanceTimersByTimeAsync(1_000);

			await expect(discovery).resolves.toEqual([]);
			expect(signals).toHaveLength(2);
			expect(signals.every((signal) => signal.aborted)).toBe(true);
			expect(commandExists).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it.runIf(process.platform !== "win32")(
		"uses only the supplied PATH for default CLI detection",
		async () => {
			const binDir = await mkdtemp(join(tmpdir(), "byok-provider-discovery-"));
			try {
				const codexPath = join(binDir, "codex");
				const markerPath = join(binDir, "codex-ran");
				await writeFile(codexPath, `#!/bin/sh\n/usr/bin/touch "${markerPath}"\n`);
				await chmod(codexPath, 0o755);

				const providers = await findAvailableProviders(
					{ env: { PATH: binDir } },
					{
						transport: vi.fn<ByokTransport>(async () => {
							throw new Error("server unavailable");
						}),
					}
				);

				expect(providers).toEqual(["codex-cli"]);
				await expect(access(markerPath)).rejects.toThrow();
			} finally {
				await rm(binDir, { recursive: true, force: true });
			}
		}
	);
});
