import { describe, expect, it } from "vitest";
import { BYOK_PROVIDER_ICONS } from "../src/provider-icons";
import { BYOK_PROVIDER_MANIFEST } from "../src/provider-manifest";

describe("provider manifest", () => {
	it("is the complete ordered provider inventory", () => {
		const ids = BYOK_PROVIDER_MANIFEST.map((entry) => entry.id);
		expect(ids).toEqual([
			"anthropic",
			"openai",
			"google",
			"xai",
			"openrouter",
			"ollama",
			"lm-studio",
			"codex-cli",
			"claude-cli",
		]);
		expect(new Set(ids).size).toBe(ids.length);
		expect(Object.keys(BYOK_PROVIDER_ICONS).sort()).toEqual([...ids].sort());
	});

	it("keeps family-specific metadata declarative and complete", () => {
		for (const entry of BYOK_PROVIDER_MANIFEST) {
			expect(entry.definition.id).toBe(entry.id);
			expect(entry.definition.label).toBeTruthy();
			expect("icon" in entry.definition).toBe(false);

			if (entry.family === "cloud") {
				expect(entry.apiKeyEnvVars.length).toBeGreaterThan(0);
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
