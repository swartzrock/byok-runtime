import { describe, expect, it } from "vitest";
import {
	CLI_DEFAULT_MODEL_SENTINEL,
	deriveProviderSetupStatus,
	recordProviderConnectionSuccess,
	type ProviderSetupStatusSettings,
} from "../src/setup-status";
import type { ByokProviderId, ByokProviderStoredSettings } from "../src";

function providerSettings(credential: string, model: string): ByokProviderStoredSettings {
	return {
		credential,
		model,
		availableModels: [],
		modelOptions: [],
		hasFetchedModels: false,
		modelRefreshMessage: "",
	};
}

function savedCloudProviderSettings(token: string, model: string): ByokProviderStoredSettings {
	return {
		credential: "",
		credentialSaved: true,
		credentialUpdatedAt: token,
		model,
		availableModels: [],
		modelOptions: [],
		hasFetchedModels: false,
		modelRefreshMessage: "",
	};
}

function baseSettings(
	overrides: Partial<ProviderSetupStatusSettings["byok"]> = {}
): ProviderSetupStatusSettings {
	return {
		byok: {
			selectedProvider: "anthropic",
			providers: {
				ollama: providerSettings("http://localhost:11434", "llama3.1:8b"),
				anthropic: providerSettings("sk-ant-test", "claude-sonnet-4-6"),
				openai: providerSettings("", ""),
				google: providerSettings("", ""),
				xai: providerSettings("", ""),
				openrouter: providerSettings("", ""),
				"codex-cli": providerSettings("codex", ""),
				"claude-cli": providerSettings("claude", ""),
			},
			verification: {},
			...overrides,
		},
	};
}

function selectProvider(
	settings: ProviderSetupStatusSettings,
	provider: ByokProviderId,
	credential: string,
	model: string
): void {
	settings.byok.selectedProvider = provider;
	settings.byok.providers[provider] = providerSettings(credential, model);
}

describe("deriveProviderSetupStatus", () => {
	it("shows saved key and model before any connection test", () => {
		expect(deriveProviderSetupStatus(baseSettings())).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "untested",
		});
	});

	it("marks a provider connection as verified when the saved key and model still match", () => {
		const settings = baseSettings();
		settings.byok.verification = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);
		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "verified",
			testedAt: "2026-06-11T00:00:00.000Z",
		});
	});

	it("marks cloud connection stale when the selected model changes", () => {
		const settings = baseSettings();
		settings.byok.verification = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);
		settings.byok.providers.anthropic = providerSettings("sk-ant-test", "claude-haiku-4-5");
		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "stale",
			testedAt: "2026-06-11T00:00:00.000Z",
		});
	});

	it("marks OpenRouter connection stale when its selected model changes", () => {
		const settings = baseSettings();
		selectProvider(settings, "openrouter", "sk-or-test", "anthropic/claude-sonnet-4");
		settings.byok.verification = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);
		settings.byok.providers.openrouter = providerSettings("sk-or-test", "openai/gpt-4o");
		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "stale",
			testedAt: "2026-06-11T00:00:00.000Z",
		});
	});

	it("marks Ollama connection stale when the model changes after a successful test", () => {
		const settings = baseSettings();
		selectProvider(settings, "ollama", "http://localhost:11434", "llama3.1:8b");
		settings.byok.verification = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);
		settings.byok.providers.ollama = providerSettings("http://localhost:11434", "llama3.2:latest");
		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "stale",
			testedAt: "2026-06-11T00:00:00.000Z",
		});
	});

	it("marks the connection stale when the key changes after a successful test", () => {
		const settings = baseSettings();
		settings.byok.verification = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);
		settings.byok.providers.anthropic = providerSettings("sk-ant-new", "claude-sonnet-4-6");
		expect(deriveProviderSetupStatus(settings).connection).toBe("stale");
	});

	it("uses cloud credential metadata without requiring a plaintext key", () => {
		const settings = baseSettings();
		settings.byok.providers.anthropic = savedCloudProviderSettings("token-1", "claude-sonnet-4-6");
		settings.byok.verification = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);

		expect(settings.byok.verification.anthropic).toMatchObject({
			credentialFingerprint: "token-1",
			credentialToken: "token-1",
		});
		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "verified",
			testedAt: "2026-06-11T00:00:00.000Z",
		});
	});

	it("marks cloud verification stale when the credential token changes", () => {
		const settings = baseSettings();
		settings.byok.providers.anthropic = savedCloudProviderSettings("token-1", "claude-sonnet-4-6");
		settings.byok.verification = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);
		settings.byok.providers.anthropic = savedCloudProviderSettings("token-2", "claude-sonnet-4-6");

		expect(deriveProviderSetupStatus(settings)).toMatchObject({
			keySaved: true,
			modelSelected: true,
			connection: "stale",
		});
	});

	it("derives provider-specific status independently for other saved providers", () => {
		const anthropic = baseSettings();
		anthropic.byok.verification = recordProviderConnectionSuccess(
			anthropic,
			"2026-06-11T00:00:00.000Z"
		);
		const openai = baseSettings({
			...anthropic.byok,
			selectedProvider: "openai",
			providers: {
				...anthropic.byok.providers,
				openai: providerSettings("sk-openai-test", "gpt-4o-mini"),
			},
		});
		expect(deriveProviderSetupStatus(openai)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "untested",
		});
	});

	it("treats Codex CLI default model as selected setup state", () => {
		const settings = baseSettings();
		selectProvider(settings, "codex-cli", "codex", "");
		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "untested",
		});
	});

	it("records the CLI default sentinel when no CLI model override is configured", () => {
		const settings = baseSettings();
		selectProvider(settings, "codex-cli", "codex", "");
		settings.byok.verification = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);
		expect(settings.byok.verification["codex-cli"]?.modelId).toBe(CLI_DEFAULT_MODEL_SENTINEL);
		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "verified",
			testedAt: "2026-06-11T00:00:00.000Z",
		});
	});

	it("marks a verified Codex CLI connection stale when its command changes", () => {
		const settings = baseSettings();
		selectProvider(settings, "codex-cli", "codex", "");
		settings.byok.verification = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);
		settings.byok.providers["codex-cli"] = providerSettings("/opt/homebrew/bin/codex", "");
		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "stale",
			testedAt: "2026-06-11T00:00:00.000Z",
		});
	});

	it("marks a verified Claude CLI connection stale when its model override changes", () => {
		const settings = baseSettings();
		selectProvider(settings, "claude-cli", "claude", "");
		settings.byok.verification = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);
		settings.byok.providers["claude-cli"] = providerSettings("claude", "sonnet");
		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "stale",
			testedAt: "2026-06-11T00:00:00.000Z",
		});
	});

	it("does not crash when a saved CLI provider is missing new CLI fields", () => {
		const settings = baseSettings();
		settings.byok.selectedProvider = "claude-cli";
		delete settings.byok.providers["claude-cli"];

		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: false,
			modelSelected: true,
			connection: "untested",
		});
	});

	it("does not crash when a saved provider id is unknown", () => {
		const settings = baseSettings({
			selectedProvider: "claude" as never,
		});

		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: false,
			modelSelected: false,
			connection: "untested",
		});
	});
});
