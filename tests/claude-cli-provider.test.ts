import { describe, expect, it, vi } from "vitest";
import {
	ClaudeCliProvider,
	extractClaudeCliOutput,
} from "../src/providers/claude-cli-provider";
import { defaultLocalCliCwd } from "../src/providers/local-command-runner";
import type {
	LocalCommandRequest,
	LocalCommandResult,
} from "../src/providers/local-command-runner";
import { ProviderError } from "../src/providers/types";

function result(stdout: string, stderr = ""): LocalCommandResult {
	return { stdout, stderr, exitCode: 0 };
}

function makeProvider(
	responses: Array<LocalCommandResult | Error>,
	model = "",
	fetchImpl?: typeof fetch
): {
	provider: ClaudeCliProvider;
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
		provider: new ClaudeCliProvider({
			command: "claude",
			model,
			cwd: "/tmp/byok-empty",
			timeoutMs: 50,
			runner: { run },
			fetchImpl,
		}),
		run,
	};
}

describe("extractClaudeCliOutput", () => {
	it("extracts a string result from Claude JSON output", () => {
		expect(
			extractClaudeCliOutput(
				JSON.stringify({ type: "result", result: "{\"summary\":\"S\"}" })
			)
		).toBe("{\"summary\":\"S\"}");
	});

	it("stringifies an object result from structured output", () => {
		expect(
			extractClaudeCliOutput(
				JSON.stringify({ type: "result", result: { summary: "S" } })
			)
		).toBe("{\"summary\":\"S\"}");
	});

	it("uses validated structured_output when Claude result text is empty", () => {
		expect(
			extractClaudeCliOutput(
				JSON.stringify({
					type: "result",
					subtype: "success",
					result: "",
					structured_output: { ok: true },
				})
			)
		).toBe("{\"ok\":true}");
	});

	it("unwraps single-quoted JSON result strings", () => {
		expect(
			extractClaudeCliOutput(
				JSON.stringify({ type: "result", result: "'{\"ok\":true}'" })
			)
		).toBe("{\"ok\":true}");
	});
});

describe("ClaudeCliProvider", () => {
	it("returns generated text from Claude CLI output", async () => {
		const { provider, run } = makeProvider([
			result(JSON.stringify({ type: "result", result: "Plain final answer." })),
		]);

		const out = await provider.generateText({ prompt: "Answer plainly." });

		expect(out).toEqual({ text: "Plain final answer." });
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toMatchObject({
			command: "claude",
			cwd: "/tmp/byok-empty",
			env: expect.objectContaining({
				CLAUDE_CODE_DISABLE_AGENT_VIEW: "1",
				CLAUDE_CODE_SKIP_PROMPT_HISTORY: "1",
				DISABLE_AUTOUPDATER: "1",
			}),
			timeoutMs: 50,
			stdin: "Answer plainly.",
		});
		expect(run.mock.calls[0][0].args).toEqual(
			expect.arrayContaining([
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
			])
		);
		expect(run.mock.calls[0][0].args).not.toContain("--json-schema");
	});

	it("passes a caller-provided JSON schema when supplied", async () => {
		const schema = JSON.stringify({
			type: "object",
			properties: { ok: { type: "boolean" } },
			required: ["ok"],
		});
		const { provider, run } = makeProvider([
			result(JSON.stringify({ type: "result", structured_output: { ok: true } })),
		]);

		const out = await provider.generateText({
			prompt: "Return JSON.",
			responseFormat: "json",
			jsonSchema: schema,
		});

		expect(out).toEqual({ text: "{\"ok\":true}" });
		expect(run.mock.calls[0][0].args).toContain("--json-schema");
		expect(run.mock.calls[0][0].args).toContain(schema);
	});

	it("uses stderr JSON when Claude leaves stdout empty", async () => {
		const { provider } = makeProvider([
			result(
				"",
				JSON.stringify({
					type: "result",
					result: "stderr answer",
				})
			),
		]);

		const out = await provider.generateText({ prompt: "Answer plainly." });

		expect(out.text).toBe("stderr answer");
	});

	it("throws ProviderError when Claude CLI returns no final text", async () => {
		const { provider } = makeProvider([result("")]);

		await expect(
			provider.generateText({ prompt: "Answer plainly." })
		).rejects.toBeInstanceOf(ProviderError);
	});

	it("maps Claude CLI generation auth failures to setup guidance", async () => {
		const { provider } = makeProvider([
			new ProviderError(
				'claude exited with code 1: {"type":"result","is_error":true,"api_error_status":401,"result":"Failed to authenticate. API Error: 401 Invalid authentication credentials"}'
			),
		]);

		await expect(
			provider.generateText({ prompt: "Hi" })
		).rejects.toThrow(
			"Claude CLI is not authenticated. Run `claude auth login` in your terminal, then try again."
		);
	});

	it("reports command-not-found from the runner during connection checks", async () => {
		const { provider } = makeProvider([
			new ProviderError(
				"claude was not found. Check the command path supplied by the host app."
			),
		]);

		const status = await provider.testConnection();

		expect(status.ok).toBe(false);
		expect(status.message).toMatch(/claude was not found/i);
	});

	it("reports unauthenticated Claude CLI status", async () => {
		const { provider } = makeProvider([
			new ProviderError("not authenticated"),
		]);

		const status = await provider.testConnection();

		expect(status.ok).toBe(false);
		expect(status.message).toMatch(/claude auth login/i);
	});

	it("reports Claude CLI 401 auth failures as setup guidance", async () => {
		const { provider } = makeProvider([
			new ProviderError(
				'claude exited with code 1: {"type":"result","is_error":true,"api_error_status":401,"result":"Failed to authenticate. API Error: 401 Invalid authentication credentials"}'
			),
		]);

		const status = await provider.testConnection();

		expect(status).toEqual({
			ok: false,
			message:
				"Claude CLI is not authenticated. Run `claude auth login` in your terminal, then try again.",
		});
	});

	it("reports successful Claude CLI status", async () => {
		const { provider } = makeProvider([
			result(JSON.stringify({ type: "result", result: { ok: true } })),
		], "sonnet");

		const status = await provider.testConnection();

		expect(status).toEqual({
			ok: true,
			message: "Connected to Claude CLI (sonnet).",
		});
	});

	it("reports successful Claude CLI status from structured_output", async () => {
		const { provider } = makeProvider([
			result(
				JSON.stringify({
					type: "result",
					subtype: "success",
					result: "",
					structured_output: { ok: true },
				})
			),
		]);

		const status = await provider.testConnection();

		expect(status).toEqual({
			ok: true,
			message: "Connected to Claude CLI.",
		});
	});

	it("accepts single-quoted JSON from the connection probe", async () => {
		const { provider } = makeProvider([
			result(JSON.stringify({ type: "result", result: "'{\"ok\":true}'" })),
		]);

		const status = await provider.testConnection();

		expect(status).toEqual({
			ok: true,
			message: "Connected to Claude CLI.",
		});
	});

	it("tests Claude CLI through the same non-interactive path used for generation", async () => {
		const { provider, run } = makeProvider([
			result(JSON.stringify({ type: "result", result: { ok: true } })),
		]);

		await provider.testConnection();

		expect(run.mock.calls[0][0]).toMatchObject({
			command: "claude",
			cwd: "/tmp/byok-empty",
			env: expect.objectContaining({
				CLAUDE_CODE_DISABLE_AGENT_VIEW: "1",
				CLAUDE_CODE_DISABLE_ARTIFACT: "1",
				CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
				CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: "1",
				CLAUDE_CODE_DISABLE_WORKFLOWS: "1",
				CLAUDE_CODE_SAFE_MODE: "1",
				CLAUDE_CODE_SKIP_PROMPT_HISTORY: "1",
				DISABLE_AUTOUPDATER: "1",
			}),
			timeoutMs: 15_000,
		});
		expect(run.mock.calls[0][0].args).toEqual(
			expect.arrayContaining([
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
				"--json-schema",
			])
		);
		expect(run.mock.calls[0][0].args).not.toEqual(
			expect.arrayContaining(["auth", "status"])
		);
		expect(run.mock.calls[0][0].args).not.toContain("--bare");
		expect(run.mock.calls[0][0].env).not.toHaveProperty("CLAUDE_CODE_SIMPLE");
	});

	it("uses a neutral temp cwd when no cwd is configured", async () => {
		const run = vi.fn<[LocalCommandRequest], Promise<LocalCommandResult>>(
			async () => result(JSON.stringify({ type: "result", result: { ok: true } }))
		);
		const provider = new ClaudeCliProvider({
			command: "claude",
			runner: { run },
		});

		await provider.testConnection();

		expect(run.mock.calls[0][0].cwd).toBe(defaultLocalCliCwd());
	});

	it("passes the configured model override and omits it when blank", async () => {
		const withModel = makeProvider([
			result(JSON.stringify({ type: "result", result: "ok" })),
		], "sonnet");
		await withModel.provider.generateText({ prompt: "Hi" });
		expect(withModel.run.mock.calls[0][0].args).toContain("--model");
		expect(withModel.run.mock.calls[0][0].args).toContain("sonnet");

		const withoutModel = makeProvider([
			result(JSON.stringify({ type: "result", result: "ok" })),
		]);
		await withoutModel.provider.generateText({ prompt: "Hi" });
		expect(withoutModel.run.mock.calls[0][0].args).not.toContain("--model");
	});

	it("normalizes OpenRouter Anthropic model overrides for Claude CLI", async () => {
		const { provider, run } = makeProvider([
			result(JSON.stringify({ type: "result", result: "ok" })),
		], "~anthropic/claude-opus-4.8");

		await provider.generateText({ prompt: "Hi" });

		expect(run.mock.calls[0][0].args).toContain("--model");
		expect(run.mock.calls[0][0].args).toContain("claude-opus-4-8");
		expect(run.mock.calls[0][0].args).not.toContain(
			"~anthropic/claude-opus-4.8"
		);
	});

	it("lists Anthropic models from OpenRouter public models", async () => {
		const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
			expect(input).toBe("https://openrouter.ai/api/v1/models");
			expect(init).toMatchObject({ method: "GET" });
			return new Response(
				JSON.stringify({
					data: [
						{ id: "anthropic/claude-sonnet-4" },
						{ id: "anthropic/claude-sonnet-4.5" },
						{ id: "anthropic/claude-sonnet-4.6" },
						{ id: "anthropic/claude-sonnet-5" },
						{ id: "anthropic/claude-sonnet-latest" },
						{ id: "openai/gpt-4o" },
						{ id: "anthropic/claude-opus-4" },
						{ id: "anthropic/claude-opus-4.1" },
						{ id: "anthropic/claude-opus-4.8" },
						{ id: "anthropic/claude-opus-4.8-fast" },
						{ id: "anthropic/claude-opus-latest" },
						{ id: "anthropic/claude-3-haiku-20240307" },
						{ id: "anthropic/claude-3.5-haiku" },
						{ id: "anthropic/claude-haiku-4.5" },
					],
				}),
				{ status: 200 }
			);
		});
		const { provider, run } = makeProvider([], "", fetchImpl);

		await expect(provider.listModels()).resolves.toEqual([
			{
				id: "claude-sonnet-5",
				label: "claude-sonnet-5",
			},
			{
				id: "claude-opus-4-8",
				label: "claude-opus-4-8",
			},
			{
				id: "claude-opus-4-8-fast",
				label: "claude-opus-4-8-fast",
			},
			{
				id: "claude-haiku-4-5",
				label: "claude-haiku-4-5",
			},
		]);
		expect(run).not.toHaveBeenCalled();
	});

	it("reports OpenRouter model-list failures", async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			new Response("temporarily unavailable", { status: 503 })
		);
		const { provider } = makeProvider([], "", fetchImpl);

		await expect(provider.listModels()).rejects.toThrow(
			/Claude CLI model fetch failed \(503\): temporarily unavailable/
		);
	});
});
