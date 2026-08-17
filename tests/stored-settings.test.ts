import { describe, expect, it } from "vitest";
import { parseByokStoredSettings } from "../src";

describe("parseByokStoredSettings", () => {
	it("returns safe defaults for non-object persisted values", () => {
		expect(parseByokStoredSettings(null)).toEqual({
			selectedProvider: "ollama",
			providers: {},
			verification: {},
		});
	});

	it("keeps valid settings and filters malformed nested collection entries", () => {
		expect(
			parseByokStoredSettings({
				selectedProvider: "anthropic",
				providers: {
					anthropic: {
						credential: "secret",
						credentialSaved: true,
						credentialUpdatedAt: "token-1",
						credentialLength: 12.9,
						model: "claude-sonnet-4-6",
						modelSelection: "claude-sonnet-4-6",
						availableModels: ["claude-sonnet-4-6", 42, ""],
						modelOptions: [
							{ id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
							{ id: 42, label: "invalid" },
							"invalid",
						],
						hasFetchedModels: true,
						modelRefreshMessage: "Fetched models.",
					},
					unknown: { credential: "ignored" },
				},
				verification: {
					anthropic: {
						credentialFingerprint: "fingerprint",
						credentialToken: "token-1",
						modelId: "claude-sonnet-4-6",
						testedAt: "2026-08-17T00:00:00.000Z",
					},
					openai: { credentialFingerprint: 42 },
					unknown: {
						credentialFingerprint: "ignored",
						modelId: "ignored",
						testedAt: "ignored",
					},
				},
			})
		).toEqual({
			selectedProvider: "anthropic",
			providers: {
				anthropic: {
					credential: "secret",
					credentialSaved: true,
					credentialUpdatedAt: "token-1",
					credentialLength: 12,
					model: "claude-sonnet-4-6",
					modelSelection: "claude-sonnet-4-6",
					availableModels: ["claude-sonnet-4-6", ""],
					modelOptions: [{ id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" }],
					hasFetchedModels: true,
					modelRefreshMessage: "Fetched models.",
				},
			},
			verification: {
				anthropic: {
					credentialFingerprint: "fingerprint",
					credentialToken: "token-1",
					modelId: "claude-sonnet-4-6",
					testedAt: "2026-08-17T00:00:00.000Z",
				},
			},
		});
	});

	it("normalizes malformed fields and legacy provider aliases", () => {
		expect(
			parseByokStoredSettings({
				selectedProvider: "claude",
				providers: {
					"claude-cli": {
						credential: 42,
						credentialSaved: "yes",
						credentialLength: -1,
						model: null,
						availableModels: "not-an-array",
						modelOptions: [{ id: "sonnet" }],
						hasFetchedModels: 1,
					},
				},
			})
		).toEqual({
			selectedProvider: "claude-cli",
			providers: {
				"claude-cli": {
					credential: "",
					credentialSaved: false,
					credentialUpdatedAt: "",
					credentialLength: 0,
					model: "",
					modelSelection: "",
					availableModels: [],
					modelOptions: [],
					hasFetchedModels: false,
					modelRefreshMessage: "",
				},
			},
			verification: {},
		});
	});
});
