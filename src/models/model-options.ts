import type { ByokModelOption } from "../types";
import { compareFetchedModelIds } from "./fetched-model-sorting";

/** Normalized model metadata shared across all providers. */
export type ModelOption = ByokModelOption;

/** Build a ModelOption from a plain string ID (used by string-only providers). */
export function normalizeStringId(id: string): ModelOption {
	return {
		id,
		label: id,
	};
}

/** Batch-normalize an array of string IDs. */
export function normalizeModelIds(ids: string[]): ModelOption[] {
	return ids.map((id) => normalizeStringId(id));
}

/** Type guard: is the value a ModelOption (not a plain string)? */
export function isModelOption(value: unknown): value is ModelOption {
	return (
		typeof value === "object" &&
		value !== null &&
		"id" in value &&
		"label" in value &&
		typeof (value as ModelOption).id === "string" &&
		typeof (value as ModelOption).label === "string"
	);
}

/**
 * Sort ModelOptions with the current model first, then human-readable order.
 * Uses the same natural collation as {@link compareFetchedModelIds} for the
 * trailing sort so IDs stay consistent with the existing fetched-model dropdown.
 */
export function sortModelOptions(options: ModelOption[], currentModelId?: string): ModelOption[] {
	return [...options].sort((a, b) => {
		if (currentModelId) {
			if (a.id === currentModelId && b.id !== currentModelId) return -1;
			if (b.id === currentModelId && a.id !== currentModelId) return 1;
		}
		return compareFetchedModelIds(a.id, b.id);
	});
}
