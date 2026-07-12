import { BYOK_PROVIDER_MANIFEST } from "./provider-manifest";
import { ByokProvider, type ByokProviderId } from "./types";

function providerIds<const T extends readonly { id: ByokProviderId }[]>(manifest: T) {
	return manifest.map((entry) => entry.id) as {
		readonly [K in keyof T]: T[K]["id"];
	};
}

export const BYOK_PROVIDER_IDS = providerIds(BYOK_PROVIDER_MANIFEST);

export function isByokProviderId(value: unknown): value is ByokProviderId {
	return typeof value === "string" && (BYOK_PROVIDER_IDS as readonly string[]).includes(value);
}

export function normalizeProviderId(value: unknown): ByokProviderId {
	if (isByokProviderId(value)) return value;
	if (value === "codex") return ByokProvider.CodexCli;
	if (value === "claude") return ByokProvider.ClaudeCli;
	return ByokProvider.Ollama;
}
