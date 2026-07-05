import { describe, expect, it, vi } from "vitest";
import {
	CodexCliProvider,
	extractCodexCliModels,
	extractCodexCliOutput,
} from "../src/providers/codex-cli-provider";
import { defaultLocalCliCwd } from "../src/providers/local-command-runner";
import type {
	LocalCommandRequest,
	LocalCommandResult,
} from "../src/providers/local-command-runner";
import { ProviderError } from "../src/providers/types";

function result(stdout: string, stderr = ""): LocalCommandResult {
	return { stdout, stderr, exitCode: 0 };
}

function eventOutput(text: string): string {
	return [
		JSON.stringify({ type: "session.started" }),
		JSON.stringify({ type: "message", item: { content: [{ text }] } }),
	].join("\n");
}

function makeProvider(responses: Array<LocalCommandResult | Error>, model = ""): {
	provider: CodexCliProvider;
	run: ReturnType<typeof vi.fn<[LocalCommandRequest], Promise<LocalCommandResult>>>;
} {
	const run = vi.fn<[LocalCommandRequest], Promise<LocalCommandResult>>(
		async () => {
			const next = responses.shift();
			if (!next) throw new Error("unexpected runner call");
			if (next instanceof Error) throw next;
			return next;
		}
	);
	return {
		provider: new CodexCliProvider({
			command: "codex",
			model,
			cwd: "/tmp/byok-empty",
			timeoutMs: 50,
			runner: { run },
		}),
		run,
	};
}

describe("extractCodexCliOutput", () => {
	it("extracts the final text from JSONL event output", () => {
		expect(extractCodexCliOutput(eventOutput('{"question":"Q?"}'))).toBe(
			'{"question":"Q?"}'
		);
	});

	it("falls back to plain stdout when the CLI prints raw final text", () => {
		expect(extractCodexCliOutput('{"summary":"S"}')).toBe('{"summary":"S"}');
	});
});

describe("extractCodexCliModels", () => {
	it("extracts model options from Codex debug models output", () => {
		expect(
			extractCodexCliModels(
				JSON.stringify({
					models: [
						{
							slug: "gpt-5.5",
							display_name: "GPT-5.5",
							description: "Frontier model.",
						},
						{
							slug: "gpt-5-codex",
							display_name: "GPT-5 Codex",
						},
					],
				})
			)
		).toEqual([
			{ id: "gpt-5.5", label: "gpt-5.5" },
			{ id: "gpt-5-codex", label: "gpt-5-codex" },
		]);
	});

	it("accepts string model arrays and ignores entries without IDs", () => {
		expect(
			extractCodexCliModels(
				JSON.stringify({
					models: ["gpt-5", { display_name: "Missing ID" }, { slug: "" }],
				})
			)
		).toEqual([{ id: "gpt-5", label: "gpt-5" }]);
	});
});

describe("CodexCliProvider", () => {
	it("returns generated text from Codex CLI output", async () => {
		const { provider, run } = makeProvider([
			result(eventOutput("Plain final answer.")),
		]);

		const out = await provider.generateText({ prompt: "Answer plainly." });

		expect(out).toEqual({ text: "Plain final answer." });
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toMatchObject({
			command: "codex",
			cwd: "/tmp/byok-empty",
			timeoutMs: 50,
			stdin: "Answer plainly.",
		});
		expect(run.mock.calls[0][0].args).toEqual([
			"exec",
			"--skip-git-repo-check",
			"--sandbox",
			"read-only",
			"--json",
		]);
		expect(run.mock.calls[0][0].args).not.toContain("--ask-for-approval");
	});

	it("throws ProviderError when Codex CLI returns no final text", async () => {
		const { provider } = makeProvider([result("")]);

		await expect(
			provider.generateText({ prompt: "Answer plainly." })
		).rejects.toBeInstanceOf(ProviderError);
	});

	it("maps runner failures into ProviderError", async () => {
		const { provider } = makeProvider([new Error("boom")]);

		await expect(
			provider.generateText({ prompt: "Answer plainly." })
		).rejects.toThrow(/Codex CLI request failed: boom/);
	});

	it("reports command-not-found from the runner during connection checks", async () => {
		const { provider } = makeProvider([
			new ProviderError(
				"codex was not found. Check the command path supplied by the host app."
			),
		]);

		const status = await provider.testConnection();

		expect(status.ok).toBe(false);
		expect(status.message).toMatch(/codex was not found/i);
	});

	it("reports unauthenticated Codex CLI status", async () => {
		const { provider } = makeProvider([result("Not logged in")]);

		const status = await provider.testConnection();

		expect(status.ok).toBe(false);
		expect(status.message).toMatch(/codex login/i);
	});

	it("reports successful Codex CLI status", async () => {
		const { provider } = makeProvider([result("Logged in as user")], "gpt-5");

		const status = await provider.testConnection();

		expect(status).toEqual({
			ok: true,
			message: "Connected to Codex CLI (gpt-5).",
		});
	});

	it("lists models via codex debug models", async () => {
		const { provider, run } = makeProvider([
			result(
				JSON.stringify({
					models: [
						{ slug: "gpt-5.5", display_name: "GPT-5.5" },
					],
				})
			),
		]);

		await expect(provider.listModels()).resolves.toEqual([
			{ id: "gpt-5.5", label: "gpt-5.5" },
		]);
		expect(run).toHaveBeenCalledWith({
			command: "codex",
			args: ["debug", "models"],
			cwd: "/tmp/byok-empty",
			timeoutMs: 15_000,
		});
	});

	it("maps Codex CLI model-list failures into ProviderError", async () => {
		const { provider } = makeProvider([new Error("boom")]);

		await expect(provider.listModels()).rejects.toThrow(
			/Codex CLI model fetch failed: boom/
		);
	});

	it("passes the configured model override and omits it when blank", async () => {
		const withModel = makeProvider([result("ok")], "gpt-5");
		await withModel.provider.generateText({ prompt: "Hi" });
		expect(withModel.run.mock.calls[0][0].args).toContain("--model");
		expect(withModel.run.mock.calls[0][0].args).toContain("gpt-5");

		const withoutModel = makeProvider([result("ok")]);
		await withoutModel.provider.generateText({ prompt: "Hi" });
		expect(withoutModel.run.mock.calls[0][0].args).not.toContain("--model");
	});

	it("uses a neutral temp cwd when no cwd is configured", async () => {
		const run = vi.fn<[LocalCommandRequest], Promise<LocalCommandResult>>(
			async () => result("Logged in as user")
		);
		const provider = new CodexCliProvider({
			command: "codex",
			runner: { run },
		});

		await provider.testConnection();

		expect(run.mock.calls[0][0].cwd).toBe(defaultLocalCliCwd());
	});
});
