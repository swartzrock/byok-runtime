import { describe, expect, it } from "vitest";
import { BYOK_PROVIDER_ICONS } from "../src/provider-icons";
import { BYOK_CLOUD_PROVIDER_MANIFEST, BYOK_PROVIDER_MANIFEST } from "../src/provider-manifest";

describe("provider manifest", () => {
	it("is the complete ordered provider inventory", () => {
		const ids = BYOK_PROVIDER_MANIFEST.map((entry) => entry.id);
		expect(ids).toEqual([
			"anthropic",
			"openai",
			"google",
			"xai",
			"openrouter",
			"groq",
			"mistral",
			"deepseek",
			"deepinfra",
			"ollama",
			"lm-studio",
			"codex-cli",
			"claude-cli",
		]);
		expect(new Set(ids).size).toBe(ids.length);
		for (const iconId of Object.keys(BYOK_PROVIDER_ICONS)) {
			expect(ids).toContain(iconId);
		}
	});

	it("preserves cloud runtime diagnostics", () => {
		expect(
			Object.fromEntries(
				Object.entries(BYOK_CLOUD_PROVIDER_MANIFEST).map(([id, entry]) => [
					id,
					{ label: entry.runtime.label, vendor: entry.runtime.vendor },
				])
			)
		).toEqual({
			anthropic: { label: "Anthropic (Claude)", vendor: "Anthropic" },
			openai: { label: "OpenAI (ChatGPT)", vendor: "OpenAI" },
			google: { label: "Google (Gemini)", vendor: "Google" },
			xai: { label: "xAI (Grok)", vendor: "xAI" },
			openrouter: { label: "OpenRouter", vendor: "OpenRouter" },
			groq: { label: "Groq", vendor: "Groq" },
			mistral: { label: "Mistral", vendor: "Mistral" },
			deepseek: { label: "DeepSeek", vendor: "DeepSeek" },
			deepinfra: { label: "DeepInfra", vendor: "DeepInfra" },
		});
	});

	it("keeps family-specific metadata declarative and complete", () => {
		for (const entry of BYOK_PROVIDER_MANIFEST) {
			expect("definition" in entry).toBe(false);

			if (entry.family === "cloud") {
				expect(entry.apiKeyEnvVars.length).toBeGreaterThan(0);
				expect(entry.runtime.label).toBeTruthy();
				expect(entry.runtime.vendor).toBeTruthy();
				expect(entry.runtime.baseURL).toMatch(/^https:\/\//);
				expect(["bearer", "anthropic-api-key"]).toContain(entry.runtime.auth);
				expect(["default", "name-fallback"]).toContain(entry.runtime.modelNormalization);
				continue;
			}

			expect("apiKeyEnvVars" in entry).toBe(false);
			expect("runtime" in entry).toBe(false);
		}
	});
});
