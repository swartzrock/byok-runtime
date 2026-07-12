import {
	isCliProviderId as isManifestCliProviderId,
	isCloudProviderId as isManifestCloudProviderId,
} from "./provider-manifest";
import { isByokProviderId } from "./registry";
import type {
	ByokProviderId,
	ByokSetupStatus,
	ByokStoredSettings,
	ByokVerificationSnapshot,
	ByokVerificationSnapshotMap,
} from "./types";

export type ProviderSetupStatusId = ByokProviderId;

export const CLI_DEFAULT_MODEL_SENTINEL = "__byok_cli_default__";

export type ProviderConnectionSnapshot = ByokVerificationSnapshot;

export type ProviderConnectionStatusMap = ByokVerificationSnapshotMap;

export interface ProviderSetupStatusSettings {
	byok: ByokStoredSettings;
}

export type DerivedProviderSetupStatus = ByokSetupStatus;

function trimValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function isCliProvider(provider: unknown): boolean {
	return isByokProviderId(provider) && isManifestCliProviderId(provider);
}

function isCloudProvider(provider: unknown): boolean {
	return isByokProviderId(provider) && isManifestCloudProviderId(provider);
}

function selectedProvider(settings: ProviderSetupStatusSettings): ProviderSetupStatusId | null {
	const provider = settings.byok?.selectedProvider;
	return isByokProviderId(provider) ? provider : null;
}

function currentCredentialValue(settings: ProviderSetupStatusSettings): string {
	const provider = selectedProvider(settings);
	return provider ? trimValue(settings.byok.providers?.[provider]?.credential) : "";
}

function currentCredentialSaved(settings: ProviderSetupStatusSettings): boolean {
	const provider = selectedProvider(settings);
	if (!provider) return false;
	const stored = settings.byok.providers?.[provider];
	return isCloudProvider(provider)
		? Boolean(stored?.credentialSaved) || currentCredentialValue(settings).length > 0
		: currentCredentialValue(settings).length > 0;
}

function currentModelValue(settings: ProviderSetupStatusSettings): string {
	const provider = selectedProvider(settings);
	return provider ? trimValue(settings.byok.providers?.[provider]?.model) : "";
}

function currentConnectionVerificationModelValue(settings: ProviderSetupStatusSettings): string {
	const provider = selectedProvider(settings);
	const model = currentModelValue(settings);
	return isCliProvider(provider) && !model ? CLI_DEFAULT_MODEL_SENTINEL : model;
}

function djb2Hash(value: string): string {
	let hash = 5381;
	for (const char of value) {
		hash = (hash * 33) ^ char.charCodeAt(0);
	}
	return (hash >>> 0).toString(16);
}

export function providerCredentialFingerprint(settings: ProviderSetupStatusSettings): string {
	const provider = selectedProvider(settings);
	if (provider && isCloudProvider(provider)) {
		const stored = settings.byok.providers?.[provider];
		if (stored?.credentialSaved) {
			return stored.credentialUpdatedAt || "saved";
		}
	}
	const value = currentCredentialValue(settings);
	return value ? djb2Hash(value) : "";
}

export function recordProviderConnectionSuccess(
	settings: ProviderSetupStatusSettings,
	testedAt: string = new Date().toISOString()
): ProviderConnectionStatusMap {
	const provider = selectedProvider(settings);
	if (!provider) return { ...(settings.byok?.verification ?? {}) };
	return {
		...(settings.byok?.verification ?? {}),
		[provider]: {
			credentialFingerprint: providerCredentialFingerprint(settings),
			credentialToken: providerCredentialFingerprint(settings),
			modelId: currentConnectionVerificationModelValue(settings),
			testedAt,
		},
	};
}

export function deriveProviderSetupStatus(
	settings: ProviderSetupStatusSettings
): DerivedProviderSetupStatus {
	const provider = selectedProvider(settings);
	if (!provider) {
		return { keySaved: false, modelSelected: false, connection: "untested" };
	}
	const keySaved = currentCredentialSaved(settings);
	const modelSelected = isCliProvider(provider) || currentModelValue(settings).length > 0;
	const snapshot = settings.byok.verification?.[provider];
	if (!snapshot) {
		return { keySaved, modelSelected, connection: "untested" };
	}
	const isFresh =
		(snapshot.credentialToken ?? snapshot.credentialFingerprint) ===
			providerCredentialFingerprint(settings) &&
		snapshot.modelId === currentConnectionVerificationModelValue(settings);
	return {
		keySaved,
		modelSelected,
		connection: isFresh ? "verified" : "stale",
		testedAt: snapshot.testedAt,
	};
}
