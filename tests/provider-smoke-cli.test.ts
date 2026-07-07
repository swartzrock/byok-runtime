import { describe, expect, it, vi } from "vitest";
import { runProviderSmokeCli } from "../examples/provider-smoke/src/cli";

describe("provider smoke CLI", () => {
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

	it("delegates Anthropic model listing to explicit API-key credentials and prints every ID", async () => {
		const output: string[] = [];
		const listModels = vi.fn().mockResolvedValue([
			{ id: "model-1", label: "model-1" },
			{ id: "model-2", label: "model-2" },
			{ id: "model-3", label: "model-3" },
			{ id: "model-4", label: "model-4" },
			{ id: "model-5", label: "model-5" },
			{ id: "model-6", label: "model-6" },
		]);

		const code = await runProviderSmokeCli(
			["models", "--provider", "anthropic", "--api-key", "sk-ant-test"],
			{
				env: {},
				stdout: (line) => output.push(line),
				byok: { generateText: vi.fn(), listModels },
			}
		);

		expect(code).toBe(0);
		expect(output).toEqual(["model-1", "model-2", "model-3", "model-4", "model-5", "model-6"]);
		expect(listModels).toHaveBeenCalledWith({
			provider: "anthropic",
			apiKey: "sk-ant-test",
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
			url: undefined,
			model: "llama3.1:8b",
			prompt: "Say hi.",
		});
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
