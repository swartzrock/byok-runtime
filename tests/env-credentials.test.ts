import { describe, expect, it } from "vitest";
import {
	ByokProviderError,
	BYOK_PROVIDER_API_KEY_ENV_VARS,
	resolveByokEnvCredential,
	type ByokEnvCredential,
} from "../src";

describe("BYOK env credentials", () => {
	it("throws a provider-specific error when Anthropic env credentials are missing", () => {
		const credential: ByokEnvCredential = { source: "env", env: {} };

		expect(() => resolveByokEnvCredential("anthropic", credential)).toThrow(ByokProviderError);
		expect(() => resolveByokEnvCredential("anthropic", credential)).toThrow(/ANTHROPIC_API_KEY/);
	});

	it("resolves Google API keys with GOOGLE_API_KEY before GEMINI_API_KEY", () => {
		const apiKey = resolveByokEnvCredential("google", {
			source: "env",
			env: {
				GOOGLE_API_KEY: "google-key",
				GEMINI_API_KEY: "gemini-key",
			},
		});

		expect(apiKey).toBe("google-key");
	});

	it.each([
		["openai", "OPENAI_API_KEY", "sk-openai-test"],
		["xai", "XAI_API_KEY", "xai-test"],
		["openrouter", "OPENROUTER_API_KEY", "sk-or-test"],
		["groq", "GROQ_API_KEY", "groq-test"],
		["mistral", "MISTRAL_API_KEY", "mistral-test"],
		["deepseek", "DEEPSEEK_API_KEY", "deepseek-test"],
		["deepinfra", "DEEPINFRA_TOKEN", "deepinfra-test"],
	] as const)("resolves %s API keys from %s", (provider, envVar, expected) => {
		expect(
			resolveByokEnvCredential(provider, {
				source: "env",
				env: { [envVar]: expected },
			})
		).toBe(expected);
	});

	it.each([
		["groq", "GROQ_API_KEY"],
		["mistral", "MISTRAL_API_KEY"],
		["deepseek", "DEEPSEEK_API_KEY"],
		["deepinfra", "DEEPINFRA_TOKEN"],
	] as const)("names %s's expected %s when credentials are missing", (provider, envVar) => {
		expect(() => resolveByokEnvCredential(provider, { source: "env", env: {} })).toThrow(envVar);
	});

	it("exports the standard API-key env var map without Ollama", () => {
		expect(BYOK_PROVIDER_API_KEY_ENV_VARS).toEqual({
			anthropic: ["ANTHROPIC_API_KEY"],
			openai: ["OPENAI_API_KEY"],
			google: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
			xai: ["XAI_API_KEY"],
			openrouter: ["OPENROUTER_API_KEY"],
			groq: ["GROQ_API_KEY"],
			mistral: ["MISTRAL_API_KEY"],
			deepseek: ["DEEPSEEK_API_KEY"],
			deepinfra: ["DEEPINFRA_TOKEN"],
		});
		expect("ollama" in BYOK_PROVIDER_API_KEY_ENV_VARS).toBe(false);
		expect("lm-studio" in BYOK_PROVIDER_API_KEY_ENV_VARS).toBe(false);
	});
});
