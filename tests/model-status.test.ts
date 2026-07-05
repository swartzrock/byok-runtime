import { describe, expect, it } from "vitest";
import {
	CLI_DEFAULT_MODEL_SENTINEL,
	deriveProviderSetupStatus,
	recordProviderConnectionSuccess,
} from "../src/setup-status";

describe("BYOK setup status", () => {
	it("derives CLI setup status with the default-model sentinel", () => {
		const settings = {
			byok: {
				selectedProvider: "codex-cli" as const,
				providers: {
					"codex-cli": {
						credential: "codex",
						model: "",
						availableModels: [],
						modelOptions: [],
						hasFetchedModels: false,
						modelRefreshMessage: "",
					},
				},
				verification: {},
			},
		};

		const providerConnectionStatus = recordProviderConnectionSuccess(
			settings,
			"2026-06-27T00:00:00.000Z"
		);

		expect(providerConnectionStatus["codex-cli"]?.modelId).toBe(CLI_DEFAULT_MODEL_SENTINEL);
		expect(
			deriveProviderSetupStatus({
				byok: {
					...settings.byok,
					verification: providerConnectionStatus,
				},
			})
		).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "verified",
			testedAt: "2026-06-27T00:00:00.000Z",
		});
	});
});
