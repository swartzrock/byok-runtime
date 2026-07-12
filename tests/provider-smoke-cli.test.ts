import { describe, expect, it, vi } from "vitest";
import { runProviderSmokeCli } from "../examples/provider-smoke/src/cli";

describe("provider smoke CLI", () => {
	it("prints providers detected by the Node runtime", async () => {
		const output: string[] = [];
		const findProviders = vi.fn().mockResolvedValue(["ollama", "codex-cli", "anthropic"]);

		const code = await runProviderSmokeCli(["detect"], {
			env: { ANTHROPIC_API_KEY: "anthropic-test" },
			stdout: (line) => output.push(line),
			findProviders,
		});

		expect(code).toBe(0);
		expect(output).toEqual(["ollama", "codex-cli", "anthropic"]);
		expect(findProviders).toHaveBeenCalledWith({
			env: { ANTHROPIC_API_KEY: "anthropic-test" },
		});
	});

	it("rejects options passed to detect", async () => {
		const errors: string[] = [];
		const findProviders = vi.fn();

		const code = await runProviderSmokeCli(["detect", "--provider", "ollama"], {
			stderr: (line) => errors.push(line),
			findProviders,
		});

		expect(code).toBe(1);
		expect(errors.join("\n")).toContain("Detect does not accept options.");
		expect(findProviders).not.toHaveBeenCalled();
	});

	it("delegates OpenAI generation to env-backed BYOK credentials", async () => {
		const output: string[] = [];
		const generateText = vi.fn().mockResolvedValue({ text: "Hello from OpenAI." });

		const code = await runProviderSmokeCli(
			["generate", "--provider", "openai", "--model", "gpt-4o-mini", "--input", "Say hi."],
			{
				env: { OPENAI_API_KEY: "sk-openai-env" },
				stdout: (line) => output.push(line),
				byok: { generateText, listModels: vi.fn() },
			}
		);

		expect(code).toBe(0);
		expect(output).toEqual(["Hello from OpenAI."]);
		expect(generateText).toHaveBeenCalledWith({
			provider: "openai",
			credential: { source: "env", env: { OPENAI_API_KEY: "sk-openai-env" } },
			model: "gpt-4o-mini",
			prompt: "Say hi.",
		});
	});

	it("delegates Anthropic model listing to env-backed credentials and prints every ID", async () => {
		const output: string[] = [];
		const listModels = vi.fn().mockResolvedValue([
			{ id: "model-1", label: "model-1" },
			{ id: "model-2", label: "model-2" },
			{ id: "model-3", label: "model-3" },
			{ id: "model-4", label: "model-4" },
			{ id: "model-5", label: "model-5" },
			{ id: "model-6", label: "model-6" },
		]);

		const code = await runProviderSmokeCli(["models", "--provider", "anthropic"], {
			env: { ANTHROPIC_API_KEY: "sk-ant-env" },
			stdout: (line) => output.push(line),
			byok: { generateText: vi.fn(), listModels },
		});

		expect(code).toBe(0);
		expect(output).toEqual(["model-1", "model-2", "model-3", "model-4", "model-5", "model-6"]);
		expect(listModels).toHaveBeenCalledWith({
			provider: "anthropic",
			credential: { source: "env", env: { ANTHROPIC_API_KEY: "sk-ant-env" } },
		});
	});

	it("uses Ollama URL-backed generation without env credentials", async () => {
		const generateText = vi.fn().mockResolvedValue({ text: "Local response." });

		const code = await runProviderSmokeCli(
			["generate", "--provider", "ollama", "--model", "llama3.1:8b", "--input", "Say hi."],
			{
				env: { OPENAI_API_KEY: "sk-openai-env" },
				stdout: vi.fn(),
				byok: { generateText, listModels: vi.fn() },
			}
		);

		expect(code).toBe(0);
		expect(generateText).toHaveBeenCalledWith({
			provider: "ollama",
			model: "llama3.1:8b",
			prompt: "Say hi.",
		});
	});

	it("uses LM Studio URL-backed generation without env credentials", async () => {
		const generateText = vi.fn().mockResolvedValue({ text: "Local response." });

		const code = await runProviderSmokeCli(
			[
				"generate",
				"--provider",
				"lm-studio",
				"--model",
				"qwen2.5-7b-instruct",
				"--input",
				"Say hi.",
			],
			{
				env: { OPENAI_API_KEY: "sk-openai-env" },
				stdout: vi.fn(),
				byok: { generateText, listModels: vi.fn() },
			}
		);

		expect(code).toBe(0);
		expect(generateText).toHaveBeenCalledWith({
			provider: "lm-studio",
			model: "qwen2.5-7b-instruct",
			prompt: "Say hi.",
		});
	});

	it("delegates CLI model listing and generation to the Node provider", async () => {
		const output: string[] = [];
		const listModels = vi.fn().mockResolvedValue([{ id: "gpt-5", label: "gpt-5" }]);
		const generateText = vi.fn().mockResolvedValue({ text: "Hello from Codex." });
		const createNodeProvider = vi.fn().mockReturnValue({ listModels, generateText });

		const modelsCode = await runProviderSmokeCli(["models", "--provider", "codex-cli"], {
			stdout: (line) => output.push(line),
			byok: { generateText: vi.fn(), listModels: vi.fn() },
			createNodeProvider,
		});
		const generateCode = await runProviderSmokeCli(
			["generate", "--provider", "codex-cli", "--model", "gpt-5", "--input", "Say hi."],
			{
				stdout: (line) => output.push(line),
				byok: { generateText: vi.fn(), listModels: vi.fn() },
				createNodeProvider,
			}
		);

		expect(modelsCode).toBe(0);
		expect(generateCode).toBe(0);
		expect(output).toEqual(["gpt-5", "Hello from Codex."]);
		expect(createNodeProvider).toHaveBeenNthCalledWith(1, {
			provider: "codex-cli",
			command: "codex",
		});
		expect(createNodeProvider).toHaveBeenNthCalledWith(2, {
			provider: "codex-cli",
			command: "codex",
			model: "gpt-5",
		});
		expect(generateText).toHaveBeenCalledWith({ prompt: "Say hi." });
	});

	it("rejects unsupported provider configuration flags", async () => {
		const errors: string[] = [];
		const createNodeProvider = vi.fn();

		const code = await runProviderSmokeCli(
			["models", "--provider", "codex-cli", "--executable", "/opt/bin/codex"],
			{
				stderr: (line) => errors.push(line),
				byok: { generateText: vi.fn(), listModels: vi.fn() },
				createNodeProvider,
			}
		);

		expect(code).toBe(1);
		expect(errors.join("\n")).toContain("Unknown option '--executable'");
		expect(createNodeProvider).not.toHaveBeenCalled();
	});

	it("returns help with a non-zero code for invalid input", async () => {
		const errors: string[] = [];

		const code = await runProviderSmokeCli(["generate", "--provider", "openai"], {
			env: {},
			stderr: (line) => errors.push(line),
			byok: { generateText: vi.fn(), listModels: vi.fn() },
		});

		expect(code).toBe(1);
		expect(errors.join("\n")).toContain("Usage:");
	});
});
