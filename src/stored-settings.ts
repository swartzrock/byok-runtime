import { BYOK_PROVIDER_IDS, normalizeProviderId } from "./registry";
import type {
	ByokModelOption,
	ByokProviderStoredSettings,
	ByokStoredSettings,
	ByokVerificationSnapshot,
	ByokVerificationSnapshotMap,
} from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function booleanValue(value: unknown): boolean {
	return typeof value === "boolean" ? value : false;
}

function nonnegativeInteger(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
}

function modelOptions(value: unknown): ByokModelOption[] {
	if (!Array.isArray(value)) return [];
	const options: ByokModelOption[] = [];
	for (const entry of value) {
		const record = asRecord(entry);
		if (record && typeof record.id === "string" && typeof record.label === "string") {
			options.push({ id: record.id, label: record.label });
		}
	}
	return options;
}

function providerSettings(value: unknown): ByokProviderStoredSettings {
	const record = asRecord(value) ?? {};
	return {
		credential: stringValue(record.credential),
		credentialSaved: booleanValue(record.credentialSaved),
		credentialUpdatedAt: stringValue(record.credentialUpdatedAt),
		credentialLength: nonnegativeInteger(record.credentialLength),
		model: stringValue(record.model),
		modelSelection: stringValue(record.modelSelection),
		availableModels: stringArray(record.availableModels),
		modelOptions: modelOptions(record.modelOptions),
		hasFetchedModels: booleanValue(record.hasFetchedModels),
		modelRefreshMessage: stringValue(record.modelRefreshMessage),
	};
}

function verificationSnapshot(value: unknown): ByokVerificationSnapshot | null {
	const record = asRecord(value);
	if (
		!record ||
		typeof record.credentialFingerprint !== "string" ||
		typeof record.modelId !== "string" ||
		typeof record.testedAt !== "string" ||
		(record.credentialToken !== undefined && typeof record.credentialToken !== "string")
	) {
		return null;
	}
	return {
		credentialFingerprint: record.credentialFingerprint,
		...(record.credentialToken === undefined ? {} : { credentialToken: record.credentialToken }),
		modelId: record.modelId,
		testedAt: record.testedAt,
	};
}

export function parseByokStoredSettings(value: unknown): ByokStoredSettings {
	const record = asRecord(value) ?? {};
	const providerRecord = asRecord(record.providers) ?? {};
	const providers: ByokStoredSettings["providers"] = {};
	for (const provider of BYOK_PROVIDER_IDS) {
		if (providerRecord[provider] !== undefined) {
			providers[provider] = providerSettings(providerRecord[provider]);
		}
	}

	const verificationRecord = asRecord(record.verification) ?? {};
	const verification: ByokVerificationSnapshotMap = {};
	for (const provider of BYOK_PROVIDER_IDS) {
		const snapshot = verificationSnapshot(verificationRecord[provider]);
		if (snapshot) verification[provider] = snapshot;
	}

	return {
		selectedProvider: normalizeProviderId(record.selectedProvider),
		providers,
		verification,
	};
}
