import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	createByok as createByokType,
	generateText as generateTextType,
	listModels as listModelsType,
} from "../src/client";
import type { ByokProviderRuntime } from "../src";

const mocks = {
	createByokProvider: vi.fn(),
	generateText: vi.fn(),
	listModels: vi.fn(),
};

let createByok: typeof createByokType;
let generateText: typeof generateTextType;
let listModels: typeof listModelsType;

const fetchImpl = (async () => new Response("{}")) as typeof fetch;
const describeForVitest = "Bun" in globalThis ? describe.skip : describe;

function mockRuntime(id = "openai"): ByokProviderRuntime {
	return {
		id: id as ByokProviderRuntime["id"],
		label: id,
		requiresNetwork: true,
		requiresDownload: false,
		testConnection: async () => ({ ok: true, message: "ok" }),
		generateText: mocks.generateText,
		listModels: mocks.listModels,
	};
}

describeForVitest("BYOK cloud client facade", () => {
	beforeEach(async () => {
		vi.resetModules();
		mocks.createByokProvider.mockReset();
		mocks.generateText.mockReset();
		mocks.listModels.mockReset();
		mocks.createByokProvider.mockReturnValue(mockRuntime());
		mocks.generateText.mockResolvedValue({ text: "Cloud response." });
		mocks.listModels.mockResolvedValue([{ id: "gpt-4o-mini", label: "gpt-4o-mini" }]);
		vi.doMock("../src/providers/provider-factory", () => ({
			createByokProvider: mocks.createByokProvider,
		}));
		({ createByok, generateText, listModels } = await import("../src/client"));
	});

	it("builds cloud provider config for generateText", async () => {
		const signal = new AbortController().signal;

		const result = await generateText({
			provider: "openai",
			apiKey: "sk-openai-test",
			model: "gpt-4o-mini",
			prompt: "Say hi.",
			signal,
			deps: { fetchImpl },
		});

		expect(result).toEqual({ text: "Cloud response." });
		expect(mocks.createByokProvider).toHaveBeenCalledWith(
			{
				provider: "openai",
				apiKey: "sk-openai-test",
				model: "gpt-4o-mini",
			},
			{ fetchImpl }
		);
		expect(mocks.generateText).toHaveBeenCalledWith({ prompt: "Say hi." }, signal);
	});

	it("binds cloud credentials in createByok and uses the call model", async () => {
		const client = createByok({
			provider: "anthropic",
			apiKey: "sk-ant-test",
			deps: { fetchImpl },
		});

		await expect(
			client.generateText({
				model: "claude-sonnet-4-6",
				prompt: "Say hi.",
			})
		).resolves.toEqual({ text: "Cloud response." });
		expect(mocks.createByokProvider).toHaveBeenCalledWith(
			{
				provider: "anthropic",
				apiKey: "sk-ant-test",
				model: "claude-sonnet-4-6",
			},
			{ fetchImpl }
		);
	});

	it("resolves env-backed Google credentials before provider creation", async () => {
		const result = await generateText({
			provider: "google",
			credential: {
				source: "env",
				env: {
					GOOGLE_API_KEY: "google-key",
					GEMINI_API_KEY: "gemini-key",
				},
			},
			model: "gemini-1.5-flash",
			prompt: "Say hi.",
		});

		expect(result).toEqual({ text: "Cloud response." });
		expect(mocks.createByokProvider).toHaveBeenCalledWith(
			{
				provider: "google",
				apiKey: "google-key",
				model: "gemini-1.5-flash",
			},
			undefined
		);
	});

	it("fails env-backed generation before provider creation when credentials are missing", async () => {
		await expect(
			generateText({
				provider: "openai",
				credential: { source: "env", env: {} },
				model: "gpt-4o-mini",
				prompt: "Say hi.",
			})
		).rejects.toThrow(/OPENAI_API_KEY/);

		expect(mocks.createByokProvider).not.toHaveBeenCalled();
	});

	it("lists cloud models without a caller-supplied model", async () => {
		const result = await listModels({
			provider: "openai",
			apiKey: "sk-openai-test",
			deps: { fetchImpl },
		});

		expect(result).toEqual([{ id: "gpt-4o-mini", label: "gpt-4o-mini" }]);
		expect(mocks.createByokProvider).toHaveBeenCalledWith(
			{
				provider: "openai",
				apiKey: "sk-openai-test",
				model: "",
			},
			{ fetchImpl }
		);
	});

	it("resolves env-backed credentials for model listing", async () => {
		await listModels({
			provider: "openai",
			credential: { source: "env", env: { OPENAI_API_KEY: "sk-openai-env" } },
		});

		expect(mocks.createByokProvider).toHaveBeenCalledWith(
			{
				provider: "openai",
				apiKey: "sk-openai-env",
				model: "",
			},
			undefined
		);
	});

	it("resolves env-backed credentials in createByok", async () => {
		const client = createByok({
			provider: "openrouter",
			credential: { source: "env", env: { OPENROUTER_API_KEY: "sk-or-env" } },
		});

		await client.generateText({
			model: "openai/gpt-4o",
			prompt: "Say hi.",
		});

		expect(mocks.createByokProvider).toHaveBeenCalledWith(
			{
				provider: "openrouter",
				apiKey: "sk-or-env",
				model: "openai/gpt-4o",
			},
			undefined
		);
	});

	it("lists Ollama models without a caller-supplied model", async () => {
		await listModels({
			provider: "ollama",
		});

		expect(mocks.createByokProvider).toHaveBeenCalledWith(
			{
				provider: "ollama",
				url: undefined,
				model: "",
			},
			undefined
		);
	});
});
