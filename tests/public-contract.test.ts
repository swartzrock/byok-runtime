import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod/v3";
import * as byok from "../src";
import { ProviderError, ProviderRateLimitError } from "../src/providers/types";
import type { ByokProviderConfig, ByokProviderRuntime } from "../src";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));

describe("BYOK public contract", () => {
	it("exports only the intentional main-entry public API", () => {
		expect(Object.keys(byok).sort()).toEqual([
			"BYOK_PROVIDER_API_KEY_ENV_VARS",
			"BYOK_PROVIDER_IDS",
			"ByokProvider",
			"ByokProviderError",
			"ByokProviderRateLimitError",
			"createByok",
			"generateText",
			"isByokProviderId",
			"listModels",
			"normalizeProviderId",
			"resolveByokEnvCredential",
		]);
		expect("createByokNodeProvider" in byok).toBe(false);
		expect("findAvailableProviders" in byok).toBe(false);
		expect("createByokProvider" in byok).toBe(false);
		expect("LocalCommandRunner" in byok).toBe(false);
	});

	it("does not expose removed provider-specific type-only model APIs", () => {
		const indexSource = readFileSync(join(PACKAGE_ROOT, "src", "index.ts"), "utf8");
		for (const forbiddenName of [
			"ByokCredentialFieldDefinition",
			"ByokCredentialKind",
			"ByokListedModel",
			"ByokModelBehavior",
			"ByokModelFieldDefinition",
			"ByokModelOptionSource",
			"ByokProviderDefinition",
			"ByokProviderIconDefinition",
			"ByokProviderIconSource",
			"ModelOptionSource",
			"OpenRouterRawModel",
			"StructuredOutputSupport",
		]) {
			expect(indexSource, forbiddenName).not.toContain(forbiddenName);
		}

		const typesSource = readFileSync(join(PACKAGE_ROOT, "src", "types.ts"), "utf8");
		const modelOptionMatch = typesSource.match(/export interface ByokModelOption \{([\s\S]*?)\n\}/);
		expect(modelOptionMatch?.[1]).toBe("\n\tid: string;\n\tlabel: string;");
	});

	it("keeps BYOK free of app and storage imports", () => {
		const files = walkFiles(join(PACKAGE_ROOT, "src")).filter((path) => path.endsWith(".ts"));
		for (const file of files) {
			const source = readFileSync(file, "utf8");
			expect(source, file).not.toMatch(/from\s+["'](?:obsidian|electron)["']/);
			expect(source, file).not.toContain("secure-credential-store");
			expect(source, file).not.toContain("HostAppSettings");
		}
	});

	it("documents examples against the public barrel", () => {
		const docs = [join(PACKAGE_ROOT, "README.md"), join(PACKAGE_ROOT, "API.md")];
		const codeExamples = docs
			.map((path) => readFileSync(path, "utf8"))
			.flatMap((doc) =>
				[...doc.matchAll(/```(?:ts|typescript)\n([\s\S]*?)```/g)].map((match) => match[1] ?? "")
			)
			.join("\n");

		expect(codeExamples).toContain('from "@swartzrock/byok-runtime"');
		expect(codeExamples).toContain('from "@swartzrock/byok-runtime/node"');
		expect(codeExamples).toContain("generateText");
		expect(codeExamples).toContain("createByok");
		expect(codeExamples).toContain("listModels");
		expect(codeExamples).toContain("ByokProvider");
		expect(codeExamples).not.toMatch(
			/from\s+["'][^"']*byok\/(?:models|providers|registry|setup-status|types)/
		);
	});

	it("represents all current provider config variants", () => {
		const configs: ByokProviderConfig[] = [
			{ provider: "anthropic", apiKey: "sk-ant-test", model: "claude-sonnet-4-6" },
			{ provider: "openai", apiKey: "sk-openai-test", model: "gpt-4o-mini" },
			{ provider: "google", apiKey: "AIza-test", model: "gemini-1.5-flash" },
			{ provider: "xai", apiKey: "xai-test", model: "grok-2-latest" },
			{ provider: "openrouter", apiKey: "sk-or-test", model: "openai/gpt-4o" },
			{ provider: "groq", apiKey: "gsk-test", model: "llama-3.3-70b-versatile" },
			{ provider: "mistral", apiKey: "mistral-test", model: "mistral-small-latest" },
			{ provider: "deepseek", apiKey: "deepseek-test", model: "deepseek-chat" },
			{
				provider: "deepinfra",
				apiKey: "deepinfra-test",
				model: "meta-llama/Llama-3.3-70B-Instruct",
			},
			{ provider: "ollama", model: "llama3.1:8b" },
			{ provider: "lm-studio", model: "qwen2.5-7b-instruct" },
			{ provider: "codex-cli", command: "codex" },
			{ provider: "claude-cli", command: "claude", model: "sonnet" },
		];

		expect(configs.map((config) => config.provider)).toEqual(byok.BYOK_PROVIDER_IDS);
	});

	it("exports a runtime shape with text, object, status, and model hooks", async () => {
		const runtime: ByokProviderRuntime = {
			id: "openai",
			label: "OpenAI (ChatGPT)",
			requiresNetwork: true,
			requiresDownload: false,
			async testConnection() {
				return { ok: true, message: "Connected." };
			},
			async listModels() {
				return [{ id: "gpt-4o-mini", label: "gpt-4o-mini" }];
			},
			async generateText() {
				return { text: "Plain response." };
			},
			async generateObject() {
				return { ok: true };
			},
		};

		await expect(runtime.testConnection()).resolves.toEqual({
			ok: true,
			message: "Connected.",
		});
		await expect(runtime.listModels()).resolves.toEqual([
			{ id: "gpt-4o-mini", label: "gpt-4o-mini" },
		]);
		await expect(runtime.generateText({ prompt: "Hi" })).resolves.toEqual({
			text: "Plain response.",
		});
		await expect(
			runtime.generateObject?.({
				prompt: "Hi",
				schema: z.object({ ok: z.boolean() }),
			})
		).resolves.toEqual({ ok: true });
	});

	it("keeps provider ID guards in the public barrel", () => {
		expect(byok.isByokProviderId("anthropic")).toBe(true);
		expect(byok.isByokProviderId("claude")).toBe(false);
		expect(byok.normalizeProviderId("claude")).toBe("claude-cli");
	});

	it("keeps provider failures catchable through public error classes", () => {
		expect(new ProviderError("failed")).toBeInstanceOf(byok.ByokProviderError);
		expect(new ProviderRateLimitError("rate limited")).toBeInstanceOf(
			byok.ByokProviderRateLimitError
		);
	});
});

function walkFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		return statSync(path).isDirectory() ? walkFiles(path) : [path];
	});
}
